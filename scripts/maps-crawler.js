import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

// Cấu hình mặc định
let rawQueries = ['spa tại Sơn Tây, Hà Nội'];
const arg = process.argv[2];

if (arg) {
    if (arg.endsWith('.json')) {
        try {
            const data = JSON.parse(fs.readFileSync(path.resolve(arg), 'utf-8'));
            if (Array.isArray(data)) {
                if (typeof data[0] === 'string') {
                    rawQueries = data;
                } else if (data[0] && Array.isArray(data[0].queries)) {
                    // Định dạng config/categories.json
                    rawQueries = data.reduce((acc, cat) => acc.concat(cat.queries), []);
                }
            }
        } catch (e) {
            console.error(`❌ Lỗi đọc file cấu hình từ khóa: ${e.message}`);
        }
    } else if (arg.includes(',')) {
        rawQueries = arg.split(',').map(q => q.trim()).filter(Boolean);
    } else {
        rawQueries = [arg];
    }
}

// Định dạng lại các từ khóa để đảm bảo có vị trí Sơn Tây / khu vực lân cận
const QUERIES = rawQueries.map(q => {
    let query = q;
    const lowerQuery = query.toLowerCase();
    if (!lowerQuery.includes('sơn tây') && !lowerQuery.includes('ba vì') && !lowerQuery.includes('phúc thọ') && !lowerQuery.includes('thạch thất') && !lowerQuery.includes('quốc oai') && !lowerQuery.includes('đan phượng')) {
        query = `${query} tại Sơn Tây, Hà Nội`;
    } else if (!lowerQuery.includes('hà nội') && !lowerQuery.includes('tại')) {
        query = `${query} tại Sơn Tây, Hà Nội`;
    }
    return query;
});

const MAX_RESULTS = 100;      // Số lượng cửa hàng tối đa muốn lấy
const BATCH_SIZE = 3;        // Số lượng tab chạy song song để tăng tốc cào (Parallel Scraping)

// Hàm tạo độ trễ ngẫu nhiên từ min đến max (giây)
const sleep = (min = 1, max = 2.5) => {
    const ms = (Math.random() * (max - min) + min) * 1000;
    return new Promise((resolve) => setTimeout(resolve, ms));
};

async function scrapeQuery(SEARCH_QUERY) {
    // Tự động chuẩn hóa tên file theo từ khóa tìm kiếm (Slugify tiếng Việt)
    const cleanFileName = SEARCH_QUERY
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Bỏ dấu tiếng Việt
        .replace(/[đĐ]/g, 'd')
        .replace(/[^a-z0-9]/g, '_') // Thay thế các ký tự đặc biệt/khoảng trắng bằng gạch dưới
        .replace(/_+/g, '_') // Rút gọn các dấu gạch dưới liền kề
        .trim()
        .replace(/^_+|_+$/g, ''); // Bỏ gạch dưới ở đầu/cuối

    const OUTPUT_FILE = `leads_${cleanFileName}.csv`;

    console.log(`\n🚀 Bắt đầu cào dữ liệu Google Maps với từ khóa: "${SEARCH_QUERY}"`);
    console.log(`💾 Kết quả sẽ được lưu vào file: ${OUTPUT_FILE}`);
    console.log(`⚡ Cấu hình chạy song song: ${BATCH_SIZE} tab cùng lúc.`);
    
    // 1. Khởi tạo trình duyệt trực quan Local (Bật chế độ Stealth cơ bản)
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            '--start-maximized',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled' // Che giấu thuộc tính tự động hóa
        ]
    });

    // Mở trang chính để tìm kiếm danh sách
    const mainPage = await browser.newPage();
    
    // Thiết lập User-Agent thực tế và vô hiệu hóa biến navigator.webdriver
    await mainPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await mainPage.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
    });

    try {
        const encodedQuery = encodeURIComponent(SEARCH_QUERY);
        const searchUrl = `https://www.google.com/maps/search/${encodedQuery}?hl=vi`;
        console.log(`🌐 Đang điều hướng trực tiếp đến kết quả tìm kiếm: ${searchUrl}`);
        
        await mainPage.goto(searchUrl, { waitUntil: 'domcontentloaded' });
        await sleep(3, 5);

        // Bỏ qua hộp thoại Consent cookie/chính sách của Google nếu xuất hiện
        console.log('🍪 Kiểm tra hộp thoại chấp nhận cookie/chính sách...');
        try {
            await mainPage.evaluate(() => {
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
            await mainPage.waitForSelector(feedSelector, { timeout: 15000 });
        } catch (e) {
            console.log('⚠️ Không tìm thấy selector div[role="feed"]. Thử tiếp tục...');
        }
        await sleep(2, 3);

        // 2. Logic Cuộn trang tự động (Lazy loading)
        console.log('📜 Bắt đầu cuộn danh sách bên trái để tải dữ liệu...');
        await autoScrollFeed(mainPage, feedSelector, MAX_RESULTS);

        // 3. Trích xuất danh sách các phần tử cửa hàng
        console.log('✨ Đang lấy danh sách các liên kết cửa hàng...');
        const itemLinks = await mainPage.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
            
            return anchors.map(a => {
                let name = a.getAttribute('aria-label') || '';
                if (!name) {
                    const headline = a.querySelector('.fontHeadlineSmall');
                    if (headline) name = headline.textContent.trim();
                }
                return {
                    name: name.trim(),
                    url: a.href
                };
            }).filter(item => item.url);
        });

        console.log(`✅ Tìm thấy tổng cộng ${itemLinks.length} liên kết cửa hàng tiềm năng.`);

        // Lọc trùng lặp sơ bộ theo URL và Tên cửa hàng
        const uniqueLinks = [];
        const seenUrls = new Set();
        const seenNames = new Set();
        
        for (const item of itemLinks) {
            if (!item.url) continue;
            const cleanUrl = item.url.split('/data=')[0];
            const nameLower = item.name.trim().toLowerCase();
            
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
        
        console.log(`🔹 Sau khi lọc trùng lặp: Còn lại ${uniqueLinks.length} cửa hàng cần cào chi tiết.`);
        
        // Giới hạn kết quả
        const linksToScrape = uniqueLinks.slice(0, MAX_RESULTS);
        console.log(`🚀 Bắt đầu cào chi tiết song song cho ${linksToScrape.length} cửa hàng...`);

        const finalResults = [];

        // Chia mảng các liên kết thành các batch để chạy song song (Parallel Scraping)
        for (let i = 0; i < linksToScrape.length; i += BATCH_SIZE) {
            const batch = linksToScrape.slice(i, i + BATCH_SIZE);
            console.log(`\n📦 Đang xử lý nhóm cửa hàng từ [${i + 1} đến ${Math.min(i + BATCH_SIZE, linksToScrape.length)}]...`);

            const promises = batch.map(async (target, index) => {
                const currentIndex = i + index + 1;
                const tab = await browser.newPage();
                
                // Thiết lập User-Agent thực tế và vô hiệu hóa biến navigator.webdriver để tránh bị bot-detection
                await tab.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                await tab.evaluateOnNewDocument(() => {
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined
                    });
                });
                
                // Chặn tải hình ảnh, font chữ để tối ưu tốc độ cào
                await tab.setRequestInterception(true);
                tab.on('request', (req) => {
                    const resourceType = req.resourceType();
                    if (['image', 'font', 'media'].includes(resourceType)) {
                        req.abort();
                    } else {
                        req.continue();
                    }
                });

                try {
                    // Mở trang chi tiết
                    await tab.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await tab.waitForSelector('h1', { timeout: 10000 });
                    await sleep(1.5, 2.5); // Đợi các nút chứa data-item-id tải hoàn tất

                    // Trích xuất chi tiết
                    const details = await tab.evaluate(() => {
                        const nameNode = document.querySelector('h1');
                        const name = nameNode ? nameNode.textContent.trim() : '';

                        // Rating & Reviews count
                        let rating = '';
                        let reviews = '0';
                        const ratingParent = document.querySelector('div.F7nice');
                        if (ratingParent) {
                            const spans = ratingParent.querySelectorAll('span');
                            if (spans.length > 0) rating = spans[0].textContent.trim();
                            if (spans.length > 1) {
                                const reviewsText = spans[1].textContent.trim();
                                const match = reviewsText.match(/\d+/);
                                if (match) reviews = match[0];
                            }
                        } else {
                            const ratingAria = document.querySelector('span[aria-label*="sao"]');
                            if (ratingAria) {
                                const match = ratingAria.getAttribute('aria-label').match(/([0-9.,]+)\s*sao/);
                                if (match) rating = match[1];
                            }
                        }

                        // Địa chỉ
                        let address = '';
                        const addressButton = document.querySelector('button[data-item-id="address"]');
                        if (addressButton) {
                            address = addressButton.textContent.trim();
                        } else {
                            const addressBtnAlternative = document.querySelector('button[data-tooltip*="địa chỉ"], button[data-tooltip*="address"]');
                            if (addressBtnAlternative) address = addressBtnAlternative.textContent.trim();
                        }

                        // Số điện thoại
                        let phone = '';
                        const phoneButton = document.querySelector('button[data-item-id^="phone:tel:"]');
                        if (phoneButton) {
                            phone = phoneButton.textContent.trim();
                        } else {
                            const phoneBtnAlternative = document.querySelector('button[data-tooltip*="điện thoại"], button[data-tooltip*="phone"]');
                            if (phoneBtnAlternative) phone = phoneBtnAlternative.textContent.trim();
                        }

                        // Trích xuất Website và Mạng xã hội (Facebook, Zalo)
                        let websiteUrl = '';
                        let facebookUrl = '';
                        let zaloUrl = '';

                        // Lấy liên kết trang web chính
                        const websiteBtn = document.querySelector('a[data-item-id="authority"]');
                        if (websiteBtn) websiteUrl = websiteBtn.href;

                        // Làm sạch link chuyển hướng của Google (nếu có)
                        if (websiteUrl && websiteUrl.startsWith('https://www.google.com/url?q=')) {
                            try {
                                const urlObj = new URL(websiteUrl);
                                const rawUrl = urlObj.searchParams.get('q') || websiteUrl;
                                websiteUrl = rawUrl.split('&')[0]; // Tách bỏ các param tracking
                            } catch (e) {}
                        }

                        // Nhận dạng Facebook/Zalo từ link website chính
                        if (websiteUrl) {
                            const lowerWeb = websiteUrl.toLowerCase();
                            if (lowerWeb.includes('facebook.com') || lowerWeb.includes('fb.com') || lowerWeb.includes('fb.watch')) {
                                facebookUrl = websiteUrl;
                                websiteUrl = ''; // Bản chất là Fanpage chứ không phải web riêng
                            } else if (lowerWeb.includes('zalo.me')) {
                                zaloUrl = websiteUrl;
                                websiteUrl = '';
                            }
                        }

                        // Quét thêm tất cả các link con trong panel để tìm Facebook/Zalo phụ
                        const allLinks = Array.from(document.querySelectorAll('a[href]'));
                        for (const link of allLinks) {
                            const href = link.href.toLowerCase();
                            if (!facebookUrl && (href.includes('facebook.com/') || href.includes('fb.com/')) && !href.includes('sharer')) {
                                facebookUrl = link.href;
                            }
                            if (!zaloUrl && href.includes('zalo.me/')) {
                                zaloUrl = link.href;
                            }
                        }

                        return {
                            name,
                            rating,
                            reviews,
                            address,
                            phone,
                            websiteUrl,
                            facebookUrl,
                            zaloUrl
                        };
                    });

                    // Gán tên tạm thời nếu không lấy được h1
                    if (!details.name) details.name = target.name;

                    // Chuẩn hóa, lọc bỏ ký tự icon lạ
                    details.address = (details.address || '').replace(/[^\x20-\x7E\u00C0-\u00FF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF]/g, '').trim();
                    details.phone = (details.phone || '').replace(/[^\x20-\x7E\u00C0-\u00FF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF]/g, '').trim();

                    // Lọc địa chỉ xem có thuộc khu vực Sơn Tây & vùng lân cận không
                    const ALLOWED_AREAS = ['sơn tây', 'ba vì', 'phúc thọ', 'thạch thất', 'quốc oai', 'đan phượng'];
                    // Loại bỏ các quận nội thành Hà Nội để tránh nhầm các tên đường trùng (ví dụ: Phố Sơn Tây - Ba Đình)
                    const EXCLUDED_DISTRICTS = ['ba đình', 'hoàn kiếm', 'tây hồ', 'cầu giấy', 'đống đa', 'hai bà trưng', 'thanh xuân', 'hoàng mai', 'long biên', 'hà đông', 'nam từ liêm', 'bắc từ liêm'];
                    
                    const addrLower = details.address.toLowerCase();
                    const isTargetArea = ALLOWED_AREAS.some(area => addrLower.includes(area));
                    const isCentralDistrict = EXCLUDED_DISTRICTS.some(dist => addrLower.includes(dist));

                    if (!isTargetArea || isCentralDistrict) {
                        console.log(`   [${currentIndex}] ⚠️ Bỏ qua: "${details.name}" (Địa chỉ không thuộc Sơn Tây hoặc ở nội thành: ${details.address || 'Trống'})`);
                    } else {
                        // Tính toán điểm tiềm năng (Scoring System)
                        const scoreData = calculateLeadScore(details);
                        details.score = scoreData.score;
                        details.scoreReasons = scoreData.reasons;
                        details.websiteStatus = details.websiteUrl ? 'Đã có Web' : 'CHƯA CÓ WEBSITE (MỤC TIÊU SỐ 1)';

                        console.log(`   [${currentIndex}] ✅ Đã cào: "${details.name}" | Điểm: ${details.score} | SĐT: ${details.phone || 'Trống'} | Web: ${details.websiteUrl ? 'Có' : 'Chưa'} | FB: ${details.facebookUrl ? 'Có' : 'Chưa'}`);
                        finalResults.push(details);
                    }

                } catch (tabErr) {
                    console.error(`   [${currentIndex}] ❌ Lỗi khi cào chi tiết: "${target.name}":`, tabErr.message);
                } finally {
                    await tab.close();
                }
            });

            // Đợi toàn bộ các tab trong batch hoàn thành
            await Promise.all(promises);
            // Nghỉ ngắn giữa các batch để tránh spam IP
            await sleep(1.5, 3.0);
        }

        // 4. Xuất file kết quả sạch ra CSV
        await exportToCSV(finalResults, OUTPUT_FILE);

    } catch (error) {
        console.error('❌ Đã xảy ra lỗi nghiêm trọng trong luồng xử lý chính:', error);
    } finally {
        console.log('\n🚪 Đang đóng trình duyệt...');
        await browser.close();
        console.log('👋 Hoàn tất chương trình cào dữ liệu Google Maps.');
    }
}

// Logic tính điểm khách hàng tiềm năng (Lead Scoring)
function calculateLeadScore(details) {
    let score = 30; // Điểm nền
    const reasons = [];

    // 1. Số điện thoại (Cực kỳ quan trọng để liên hệ)
    if (details.phone) {
        score += 25;
        reasons.push('Có SĐT (+25)');
    } else {
        reasons.push('Không SĐT (0)');
    }

    // 2. Tình trạng Website (Không có website là mục tiêu số 1 để bán SaaS)
    if (details.websiteUrl) {
        score -= 20;
        reasons.push('Đã có Website (-20)');
    } else {
        score += 20;
        reasons.push('Chưa có Website (+20)');
        
        // 3. Có mạng xã hội (Facebook) nhưng KHÔNG CÓ website -> Cực kỳ tiềm năng
        if (details.facebookUrl) {
            score += 15;
            reasons.push('Có FB nhưng chưa có Web (+15)');
        }
    }

    // 4. Ưu tiên địa bàn cốt lõi Sơn Tây
    if (details.address.toLowerCase().includes('sơn tây')) {
        score += 10;
        reasons.push('Địa bàn trung tâm Sơn Tây (+10)');
    }

    // 5. Mức độ hoạt động (Có đánh giá chứng tỏ cửa hàng vẫn hoạt động năng nổ)
    const reviewsNum = parseInt(details.reviews, 10) || 0;
    if (reviewsNum > 0 || (details.rating && parseFloat(details.rating) > 0)) {
        score += 10;
        reasons.push('Có tương tác/đang hoạt động (+10)');
    }

    // 6. Hình phạt nặng nếu thiếu cả số điện thoại lẫn địa chỉ
    if (!details.phone && !details.address) {
        score -= 30;
        reasons.push('Thiếu thông tin liên hệ (-30)');
    }

    // Giới hạn điểm số từ 0 đến 100
    score = Math.max(0, Math.min(100, score));

    return {
        score,
        reasons: reasons.join('; ')
    };
}

// Hàm cuộn danh sách div[role="feed"] tự động
async function autoScrollFeed(page, feedSelector, maxResults) {
    await page.evaluate(async (feedSel, maxRes) => {
        const feed = document.querySelector(feedSel) || document.body;
        
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 300;
            let lastScrollTop = -1;
            let noChangeCount = 0;
            
            const timer = setInterval(() => {
                const scrollHeight = feed.scrollHeight;
                feed.scrollBy(0, distance);
                totalHeight += distance;

                const itemsCount = document.querySelectorAll('a[href*="/maps/place/"]').length;
                const textLower = document.body.innerText.toLowerCase();
                const endOfList = textLower.includes('đến cuối danh sách') || 
                                  textLower.includes('xem hết danh sách') || 
                                  textLower.includes('không tìm thấy kết quả') || 
                                  textLower.includes('không có kết quả') ||
                                  textLower.includes("reached the end") ||
                                  textLower.includes("no more results");

                // Kiểm tra xem vị trí cuộn có thực sự thay đổi không (nếu chạm đáy, scrollTop sẽ đứng yên)
                const currentScrollTop = (feed === document.body) ? window.scrollY : feed.scrollTop;
                if (currentScrollTop === lastScrollTop) {
                    noChangeCount++;
                } else {
                    noChangeCount = 0;
                    lastScrollTop = currentScrollTop;
                }

                // Nếu nhận dạng được text kết thúc, hoặc đủ số lượng, hoặc không cuộn được nữa trong 5 giây liên tục
                if (endOfList || itemsCount >= maxRes || noChangeCount >= 5 || totalHeight >= scrollHeight * 10) {
                    clearInterval(timer);
                    resolve();
                }
            }, 1000);
        });
    }, feedSelector, maxResults);

    await sleep(2, 3);
}

// Hàm xuất file CSV có UTF-8 BOM
async function exportToCSV(data, fileName) {
    console.log(`\n💾 Đang xuất danh sách ra file CSV: ${fileName}...`);
    
    // Tiêu đề cột
    const headers = [
        'Tên cửa hàng',
        'Điểm tiềm năng',
        'Địa chỉ',
        'Số điện thoại',
        'Đường dẫn Website',
        'Đường dẫn Facebook',
        'Link Zalo',
        'Trạng thái Website',
        'Đánh giá trung bình',
        'Tổng số nhận xét',
        'Lý do chấm điểm'
    ];
    
    // Chuyển dữ liệu sang CSV hàng
    const rows = data.map(item => [
        escapeCSVField(item.name),
        escapeCSVField(item.score),
        escapeCSVField(item.address),
        escapeCSVField(item.phone),
        escapeCSVField(item.websiteUrl),
        escapeCSVField(item.facebookUrl),
        escapeCSVField(item.zaloUrl),
        escapeCSVField(item.websiteStatus),
        escapeCSVField(item.rating),
        escapeCSVField(item.reviews),
        escapeCSVField(item.scoreReasons)
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const bom = '\uFEFF';
    
    try {
        const filePath = path.join(process.cwd(), fileName);
        fs.writeFileSync(filePath, bom + csvContent, 'utf-8');
        console.log(`🎉 Xuất file CSV thành công tại: "${fileName}"`);
        
        // Đồng thời xuất file lưu trữ dạng JSONL để dễ dàng deduplicate hoặc import DB sau này
        const jsonlFileName = fileName.replace('.csv', '.jsonl');
        const jsonlPath = path.join(process.cwd(), jsonlFileName);
        const jsonlContent = data.map(item => JSON.stringify(item)).join('\n');
        fs.writeFileSync(jsonlPath, jsonlContent, 'utf-8');
        console.log(`🎉 Xuất file JSONL lưu trữ thành công tại: "${jsonlFileName}"`);
        
        console.log(`💡 Bạn có thể click đúp mở trực tiếp file CSV bằng Microsoft Excel.`);
    } catch (error) {
        console.error('❌ Lỗi khi ghi file kết quả:', error);
    }
}

// Chuẩn hóa trường để không làm lỗi định dạng CSV
function escapeCSVField(val) {
    if (val === undefined || val === null) return '""';
    let str = String(val).trim();
    str = str.replace(/"/g, '""');
    return `"${str}"`;
}

// Thực thi chương trình chính
async function main() {
    console.log(`🎯 Tổng cộng có ${QUERIES.length} từ khóa cần quét.`);
    for (let i = 0; i < QUERIES.length; i++) {
        const q = QUERIES[i];
        console.log(`\n=======================================================`);
        console.log(`[${i + 1}/${QUERIES.length}] Bắt đầu tiến trình cho: ${q}`);
        console.log(`=======================================================`);
        try {
            await scrapeQuery(q);
        } catch (err) {
            console.error(`❌ Thất bại khi cào từ khóa "${q}":`, err);
        }
        if (i < QUERIES.length - 1) {
            console.log(`💤 Nghỉ 5 giây trước khi chuyển sang từ khóa tiếp theo...`);
            await sleep(5, 7);
        }
    }
    console.log(`\n🎉 Hoàn thành quét tất cả các từ khóa trên Google Maps!`);
}

main();
