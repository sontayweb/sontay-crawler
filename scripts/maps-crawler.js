import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

// Cấu hình mặc định
let searchQuery = 'spa tại Sơn Tây, Hà Nội';
if (process.argv[2]) {
    searchQuery = process.argv[2];
    // Tự động định vị về Sơn Tây nếu câu truy vấn không chỉ định cụ thể
    const lowerQuery = searchQuery.toLowerCase();
    if (!lowerQuery.includes('sơn tây') && !lowerQuery.includes('ba vì') && !lowerQuery.includes('phúc thọ') && !lowerQuery.includes('thạch thất') && !lowerQuery.includes('quốc oai') && !lowerQuery.includes('đan phượng')) {
        searchQuery = `${searchQuery} tại Sơn Tây, Hà Nội`;
    } else if (!lowerQuery.includes('hà nội') && !lowerQuery.includes('tại')) {
        searchQuery = `${searchQuery} tại Sơn Tây, Hà Nội`;
    }
}

const SEARCH_QUERY = searchQuery;
const OUTPUT_FILE = 'danh_sach_maps_son_tay.csv';
const MAX_RESULTS = 100; // Số lượng cửa hàng tối đa muốn cào

// Hàm tạo độ trễ ngẫu nhiên từ min đến max (giây)
const sleep = (min = 1, max = 2.5) => {
    const ms = (Math.random() * (max - min) + min) * 1000;
    return new Promise((resolve) => setTimeout(resolve, ms));
};

async function main() {
    console.log(`\n🚀 Bắt đầu cào dữ liệu Google Maps với từ khóa: "${SEARCH_QUERY}"`);
    
    // 1. Khởi tạo trình duyệt trực quan Local
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            '--start-maximized',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });

    const page = await browser.newPage();

    try {
        // Điều hướng trực tiếp đến trang tìm kiếm của Google Maps để bỏ qua việc nhập ô tìm kiếm
        const encodedQuery = encodeURIComponent(SEARCH_QUERY);
        const searchUrl = `https://www.google.com/maps/search/${encodedQuery}?hl=vi`;
        console.log(`🌐 Đang điều hướng trực tiếp đến kết quả tìm kiếm: ${searchUrl}`);
        
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
        await sleep(3, 5);

        // Bỏ qua hộp thoại Consent cookie của Google nếu xuất hiện
        console.log('🍪 Kiểm tra hộp thoại chấp nhận cookie/chính sách...');
        try {
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const acceptBtn = buttons.find(b => {
                    const txt = b.textContent.toLowerCase();
                    return txt.includes('chấp nhận tất cả') || txt.includes('đồng ý') || txt.includes('accept all') || txt.includes('i agree');
                });
                if (acceptBtn) {
                    acceptBtn.click();
                    console.log('✅ Đã click đồng ý cookie!');
                }
            });
            await sleep(2, 3);
        } catch (cookieErr) {
            console.log('⚠️ Không tìm thấy hoặc lỗi khi xử lý hộp thoại cookie (Bỏ qua):', cookieErr.message);
        }
        
        // Chờ danh sách kết quả tải
        console.log('⌛ Đang đợi danh sách kết quả tải...');
        const feedSelector = 'div[role="feed"]';
        try {
            await page.waitForSelector(feedSelector, { timeout: 15000 });
        } catch (e) {
            console.log('⚠️ Không tìm thấy selector div[role="feed"]. Thử tiếp tục...');
        }
        await sleep(2, 3);

        // 2. Logic Cuộn trang tự động (Lazy loading)
        console.log('📜 Bắt đầu cuộn danh sách bên trái để tải dữ liệu...');
        await autoScrollFeed(page, feedSelector, MAX_RESULTS);

        // 3. Trích xuất danh sách các phần tử cửa hàng
        console.log('✨ Đang lấy danh sách các liên kết cửa hàng...');
        const itemLinks = await page.evaluate(() => {
            // Tìm tất cả các thẻ a có chứa đường dẫn liên kết đến Maps place
            const anchors = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
            
            return anchors.map(a => {
                // Thử lấy tên từ aria-label
                let name = a.getAttribute('aria-label') || '';
                
                // Nếu không có aria-label, thử lấy text từ thẻ con chứa tên cửa hàng
                if (!name) {
                    const headline = a.querySelector('.fontHeadlineSmall');
                    if (headline) {
                        name = headline.textContent.trim();
                    }
                }
                
                return {
                    name: name.trim(),
                    url: a.href
                };
            }).filter(item => item.url);
        });

        console.log(`✅ Tìm thấy tổng cộng ${itemLinks.length} liên kết cửa hàng tiềm năng.`);

        // Lọc trùng lặp theo URL và Tên cửa hàng
        const uniqueLinks = [];
        const seenUrls = new Set();
        const seenNames = new Set();
        
        for (const item of itemLinks) {
            if (!item.url) continue;
            // Chuẩn hóa URL để so sánh (lấy phần trước /data)
            const cleanUrl = item.url.split('/data=')[0];
            const nameLower = item.name.trim().toLowerCase();
            
            // Chỉ thêm nếu chưa thấy URL và tên không trống + chưa thấy tên
            if (!seenUrls.has(cleanUrl) && nameLower) {
                if (!seenNames.has(nameLower)) {
                    seenUrls.add(cleanUrl);
                    seenNames.add(nameLower);
                    uniqueLinks.push({
                        name: item.name.trim(),
                        url: item.url
                    });
                }
            }
        }
        
        console.log(`🔹 Sau khi lọc trùng lặp: Còn lại ${uniqueLinks.length} cửa hàng cần lấy chi tiết (Giới hạn tối đa: ${MAX_RESULTS}).`);
        
        // Cắt bớt danh sách nếu vượt quá giới hạn
        const linksToScrape = uniqueLinks.slice(0, MAX_RESULTS);
        console.log(`🚀 Bắt đầu cào chi tiết cho ${linksToScrape.length} cửa hàng...`);

        const finalResults = [];

        // Duyệt qua từng cửa hàng để lấy thông tin chi tiết
        for (let i = 0; i < linksToScrape.length; i++) {
            const target = linksToScrape[i];
            console.log(`\n👉 [${i + 1}/${linksToScrape.length}] Đang xử lý: ${target.name}`);

            try {
                // Chuyển hướng trực tiếp để tải trang chi tiết cửa hàng
                await page.goto(target.url, { waitUntil: 'domcontentloaded' });
                await sleep(2, 3.5); // Chờ chi tiết tải xong

                // Trích xuất các trường thông tin chính xác
                const details = await page.evaluate(() => {
                    // Tên cửa hàng
                    const nameNode = document.querySelector('h1');
                    const name = nameNode ? nameNode.textContent.trim() : '';

                    // Đánh giá sao (Rating) & Số lượng đánh giá
                    let rating = '';
                    let reviews = '0';
                    const ratingParent = document.querySelector('div.F7nice');
                    if (ratingParent) {
                        const spans = ratingParent.querySelectorAll('span');
                        if (spans.length > 0) {
                            rating = spans[0].textContent.trim();
                        }
                        if (spans.length > 1) {
                            // Text thường dạng "(12)" hoặc "12 nhận xét"
                            const reviewsText = spans[1].textContent.trim();
                            const match = reviewsText.match(/\d+/);
                            if (match) {
                                reviews = match[0];
                            }
                        }
                    } else {
                        // Thử tìm theo aria-label chứa sao
                        const ratingAria = document.querySelector('span[aria-label*="sao"]');
                        if (ratingAria) {
                            const match = ratingAria.getAttribute('aria-label').match(/([0-9.,]+)\s*sao/);
                            if (match) rating = match[1];
                        }
                    }

                    // Địa chỉ: tìm button có data-item-id="address" hoặc tương đương
                    let address = '';
                    const addressButton = document.querySelector('button[data-item-id="address"]');
                    if (addressButton) {
                        address = addressButton.textContent.trim();
                    } else {
                        const addressBtnAlternative = document.querySelector('button[data-tooltip*="địa chỉ"], button[data-tooltip*="address"]');
                        if (addressBtnAlternative) {
                            address = addressBtnAlternative.textContent.trim();
                        }
                    }
                    // Loại bỏ ký tự icon đặc biệt của Google Maps ở đầu địa chỉ
                    address = address.replace(/[^\x20-\x7E\u00C0-\u00FF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF]/g, '').trim();

                    // Số điện thoại: tìm button có data-item-id bắt đầu bằng phone:tel:
                    let phone = '';
                    const phoneButton = document.querySelector('button[data-item-id^="phone:tel:"]');
                    if (phoneButton) {
                        phone = phoneButton.textContent.trim();
                    } else {
                        const phoneBtnAlternative = document.querySelector('button[data-tooltip*="điện thoại"], button[data-tooltip*="phone"]');
                        if (phoneBtnAlternative) {
                            phone = phoneBtnAlternative.textContent.trim();
                        }
                    }
                    // Loại bỏ ký tự icon đặc biệt ở đầu số điện thoại
                    phone = phone.replace(/[^\x20-\x7E\u00C0-\u00FF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF]/g, '').trim();

                    // Kiểm tra website
                    let websiteStatus = 'CHƯA CÓ WEBSITE (MỤC TIÊU SỐ 1)';
                    const websiteBtn = document.querySelector('a[data-item-id="authority"], button[data-item-id="authority"]');
                    if (websiteBtn) {
                        websiteStatus = 'Đã có Web';
                    } else {
                        const webBtnAlternative = document.querySelector('a[data-tooltip*="website"], a[data-tooltip*="trang web"], a[aria-label*="Website"], a[aria-label*="Trang web"]');
                        if (webBtnAlternative) {
                            websiteStatus = 'Đã có Web';
                        }
                    }

                    return {
                        name,
                        rating,
                        reviews,
                        address,
                        phone,
                        websiteStatus
                    };
                });

                // Nếu không bóc tách được tên từ trang chi tiết thì dùng tên tạm ở danh sách
                if (!details.name) {
                    details.name = target.name;
                }

                // Lọc bỏ nếu không thuộc các khu vực Sơn Tây, Ba Vì, Phúc Thọ, Thạch Thất, Quốc Oai, Đan Phượng
                const ALLOWED_AREAS = ['sơn tây', 'ba vì', 'phúc thọ', 'thạch thất', 'quốc oai', 'đan phượng'];
                const addrLower = (details.address || '').toLowerCase();
                const isTargetArea = ALLOWED_AREAS.some(area => addrLower.includes(area));

                if (!isTargetArea) {
                    console.log(`   ⚠️ Bỏ qua cửa hàng này vì địa chỉ không thuộc Sơn Tây hoặc khu vực lân cận.`);
                    continue;
                }

                console.log(`   📍 Địa chỉ: ${details.address || 'Không tìm thấy'}`);
                console.log(`   📞 Số ĐT: ${details.phone || 'Không tìm thấy'}`);
                console.log(`   ⭐ Đánh giá: ${details.rating || 'N/A'} (${details.reviews} đánh giá)`);
                console.log(`   🌐 Website: ${details.websiteStatus}`);

                finalResults.push(details);

            } catch (err) {
                console.error(`❌ Lỗi khi cào chi tiết cửa hàng "${target.name}":`, err.message);
            }

            // Nghỉ ngơi giữa các cửa hàng để giả lập người dùng thật
            await sleep(1.5, 3.0);
        }

        // 4. Xuất file kết quả sạch (Output File)
        await exportToCSV(finalResults, OUTPUT_FILE);

    } catch (error) {
        console.error('❌ Đã xảy ra lỗi nghiêm trọng trong luồng xử lý:', error);
    } finally {
        console.log('\n🚪 Đang đóng trình duyệt...');
        await browser.close();
        console.log('👋 Hoàn tất chương trình cào dữ liệu Google Maps.');
    }
}

// Hàm cuộn danh sách div[role="feed"] tự động
async function autoScrollFeed(page, feedSelector, maxResults) {
    await page.evaluate(async (feedSel, maxRes) => {
        const feed = document.querySelector(feedSel) || document.body;
        
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 300; // Khoảng cách cuộn mỗi lần
            
            const timer = setInterval(() => {
                const scrollHeight = feed.scrollHeight;
                feed.scrollBy(0, distance);
                totalHeight += distance;

                // Đếm số lượng liên kết địa điểm hiện có
                const itemsCount = document.querySelectorAll('a[href*="/maps/place/"]').length;
                const text = document.body.innerText;
                const endOfList = text.includes('Bạn đã đi đến cuối danh sách') || text.includes('Không tìm thấy kết quả nào khác') || text.includes("You've reached the end of the list");

                if (endOfList || itemsCount >= maxRes || totalHeight >= scrollHeight * 10) {
                    clearInterval(timer);
                    resolve();
                }
            }, 1000); // Tốc độ cuộn 1 giây / lần
        });
    }, feedSelector, maxResults);

    await sleep(2, 3);
}

// Hàm xuất file CSV có UTF-8 BOM
async function exportToCSV(data, fileName) {
    console.log(`\n💾 Đang xuất danh sách ra file CSV: ${fileName}...`);
    
    // Định dạng tiêu đề cột
    const headers = ['Tên cửa hàng', 'Địa chỉ', 'Số điện thoại', 'Đánh giá trung bình', 'Tổng số nhận xét', 'Trạng thái Website'];
    
    // Chuyển dữ liệu sang định dạng hàng CSV
    const rows = data.map(item => [
        escapeCSVField(item.name),
        escapeCSVField(item.address),
        escapeCSVField(item.phone),
        escapeCSVField(item.rating),
        escapeCSVField(item.reviews),
        escapeCSVField(item.websiteStatus)
    ]);

    // Tạo nội dung CSV (Dấu phân tách là dấu phẩy)
    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    // Sử dụng \uFEFF làm Byte Order Mark (BOM) để Excel nhận dạng UTF-8
    const bom = '\uFEFF';
    
    try {
        const filePath = path.join(process.cwd(), fileName);
        fs.writeFileSync(filePath, bom + csvContent, 'utf-8');
        console.log(`🎉 Xuất file thành công! Bạn có thể click đúp mở trực tiếp file "${fileName}" bằng Microsoft Excel tại Việt Nam.`);
    } catch (error) {
        console.error('❌ Lỗi khi ghi file CSV:', error);
    }
}

// Chuẩn hóa trường để không làm lỗi định dạng CSV
function escapeCSVField(val) {
    if (val === undefined || val === null) return '""';
    let str = String(val).trim();
    // Thay thế dấu ngoặc kép bằng hai dấu ngoặc kép để thoát ký tự
    str = str.replace(/"/g, '""');
    // Bọc toàn bộ trong dấu ngoặc kép để tránh bị lỗi bởi dấu phẩy hoặc xuống dòng
    return `"${str}"`;
}

// Thực thi chương trình
main();
