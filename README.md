# 🕵️‍♂️ Son Tay Business Lead Scraper & AI Enricher

Hệ thống tự động hóa khai thác, chuẩn hóa, phân loại và làm sạch dữ liệu khách hàng tiềm năng (Leads) chất lượng cao từ mạng xã hội (Facebook, Google Places, DuckDuckGo Search, Trang Vàng). Tích hợp trí tuệ nhân tạo **Gemini AI** để trích xuất dữ liệu sạch thời gian thực.

---

## 🚀 Tính Năng Vượt Trội

1. **Đa nguồn dữ liệu (Multi-Source Adapters)**:
   - **Facebook CDP (Chrome Debugger Mode)**: Điều khiển tab Chrome thực tế qua cổng debug CDP 9222. Cào bài viết và bình luận từ các hội nhóm Facebook Sơn Tây, Ba Vì...
   - **Google Places API**: Lấy danh sách doanh nghiệp chính thống có đầy đủ đánh giá (Rating), thời gian mở cửa.
   - **DuckDuckGo Search Scraper**: Khai thác các bài viết danh sách "Top 10", trang web chính thức của cửa hàng.
   - **Public Directories (Playwright)**: Bỏ qua tường lửa chống cào (Cloudflare) để lấy thông tin từ các trang danh bạ doanh nghiệp.
2. **Khai Thác Bình Luận Gợi Ý (Comment Recommendation Lead Extraction)**:
   - Tự động quét và phân tích bình luận dưới bài viết nhóm để tìm kiếm thông tin giới thiệu dịch vụ/số điện thoại từ người dùng cộng đồng.
3. **Phân Tích Bằng Gemini AI**:
   - Sử dụng mô hình `gemini-flash-lite-latest` để phân tích văn bản bài đăng thô thành cấu trúc dữ liệu JSON sạch (Tên cửa hàng, SĐT, Địa chỉ, Lĩnh vực).
4. **Loại Trùng & Tích Lũy Thông Minh (Smart Deduplication)**:
   - Tự động tải cơ sở dữ liệu lịch sử để lọc trùng trước khi gọi API Gemini nhằm tiết kiệm **90%** chi phí API.
   - Hợp nhất thông tin cũ và mới một cách thông minh (giữ lại thông tin chi tiết nhất).
5. **Cơ Chế Bỏ Qua Sớm (Early Keyword Skipping)**:
   - Nếu phát hiện tỷ lệ dữ liệu trùng lặp trong phiên cào hiện tại vượt quá **70%**, bộ cào sẽ tự động bỏ qua từ khóa đó để chuyển sang từ khóa khác nhằm tiết kiệm tài nguyên.
6. **Khôi Phục Dữ Liệu Tự Động (Data Recovery)**:
   - Mỗi lần cào đều lưu trữ bản sao lưu thô (raw backup). Hỗ trợ lệnh khôi phục lại toàn bộ dữ liệu lịch sử nếu xảy ra sự cố mất file.

---

## 📁 Cấu Trúc Thư Mục Dự Án

```text
sontay-crawler/
├── config/                  # Cấu hình danh mục (categories) và khu vực (areas)
├── data/                    # Nơi lưu trữ dữ liệu (Được ignore khỏi Git để bảo mật)
│   ├── chrome-debug/        # Profile trình duyệt Chrome Debug độc lập
│   ├── exports/             # File kết quả cào CSV và file nhật ký cào (.log)
│   ├── processed/           # Cơ sở dữ liệu chính dạng JSON Lines (leads.jsonl)
│   └── raw/                 # Bản sao lưu dữ liệu thô (raw backup) của mỗi phiên chạy
├── src/
│   ├── pipeline/            # Đường ống xử lý: normalize, enrich, score, dedupe, export
│   ├── sources/             # Các bộ cào: Facebook CDP, Google Places, DuckDuckGo...
│   ├── storage/             # Quản lý đọc/ghi file và stubs kết nối MongoDB
│   ├── utils/               # Công cụ hỗ trợ: Gemini AI client, xử lý SĐT, URL...
│   └── restore.ts           # Công cụ khôi phục dữ liệu thô từ thư mục backup
├── run-facebook-cdp.bat     # File chạy tự động hóa cào Facebook trên Windows (One-Click)
└── package.json             # Khai báo thư viện & kịch bản lệnh chạy
```

---

## 🛠 Hướng Dẫn Cài Đặt

### 1. Yêu Cầu Hệ Thống
* Đã cài đặt **Node.js** (Phiên bản từ 18 trở lên).
* Hệ điều hành Windows (Có sẵn trình duyệt Google Chrome).

### 2. Cài Đặt Thư Viện
Mở Terminal tại thư mục dự án và chạy lệnh:
```bash
npm install
npm run build
```

### 3. Cấu Hình File Môi Trường (`.env`)
Tạo file `.env` tại thư mục gốc của dự án với nội dung như sau:
```env
GOOGLE_PLACES_API_KEY=your_google_api_key_here
GEMINI_API_KEY=AQ.Ab8... (Khoá API Gemini của bạn)
GEMINI_MODEL=gemini-flash-lite-latest
```

---

## 🖥 Hướng Dẫn Sử Dụng

### 1. Cào Dữ Liệu Facebook (Nhanh Nhất & Tiện Lợi Nhất)
Kích đúp vào file **`run-facebook-cdp.bat`** trên Windows của bạn:
* **Bước 1**: Công cụ sẽ tự tìm đường dẫn Google Chrome và khởi chạy một cửa sổ debug riêng biệt.
* **Bước 2**: Đăng nhập Facebook của bạn trên cửa sổ Chrome vừa hiện ra và đi đến Group Facebook cần quét (ví dụ: các hội nhóm Sơn Tây).
* **Bước 3**: Nhập từ khóa muốn quét ở màn hình Terminal (ví dụ: `spa`, `tiệm vàng` hoặc ấn **Enter** để quét toàn bộ 13 từ khóa mặc định).
* **Bước 4**: Nhấn phím bất kỳ ở Terminal để tiến hành cào dữ liệu tự động.

> [!NOTE]
> Kết quả cào sẽ được xuất riêng biệt thành các file có dấu thời gian (timestamp) tại thư mục `data/exports/facebook_leads_YYYYMMDD_HHmmss.csv` và file nhật ký chạy `.log`.

### 2. Khôi Phục Dữ Liệu Lịch Sử
Nếu vô tình làm mất file CSV hoặc dữ liệu trong cơ sở dữ liệu bị sai lệch, bạn có thể tái tạo lại toàn bộ dữ liệu lịch sử sạch từ các bản sao lưu thô (raw backups) bằng cách chạy lệnh:
```bash
npm run restore
```
Hệ thống sẽ tự động đọc thư mục `data/raw`, loại bỏ trùng lặp, tính điểm lại và ghi đè an toàn vào `data/processed/leads.jsonl` đồng thời tạo ra file CSV khôi phục đầy đủ tại `data/exports/facebook_leads_restored.csv`.

### 3. Chạy Bằng Lệnh CLI Chi Tiết
Bạn có thể gọi trực tiếp lệnh cào thông qua CLI bằng cú pháp:
```bash
# Cào một từ khóa cụ thể từ Facebook Group
npm run scrape -- --source='facebook-cdp' --query='spa' --out='data/exports/my_spa_leads.csv'

# Cào tất cả từ khóa mặc định từ Facebook Group
npm run scrape -- --source='facebook-cdp' --query='all'
```

---

## 📈 Quy Trình Đánh Giá Điểm Ưu Tiên (Scoring Logic)

Mỗi Lead sau khi cào sẽ được chấm điểm từ **0 đến 100** dựa theo các tiêu chí để ưu tiên telesale/marketing:
* **Có số điện thoại**: `+25 điểm`
* **Có Fanpage nhưng chưa có Website riêng**: `+20 điểm` (Cơ hội bán dịch vụ làm Web cực cao)
* **Lĩnh vực nằm trong danh sách mẫu SaaS của bạn (Spa, Cafe, Gara...)**: `+15 điểm`
* **Nằm trong địa bàn ưu tiên (Sơn Tây, Ba Vì...)**: `+10 điểm`
* **Có Website dạng Blog cá nhân hoặc miễn phí (Blogspot, Wix...)**: `+10 điểm`
* **Đã có Website chuyên nghiệp tên miền riêng**: `-20 điểm`
* **Thiếu cả số điện thoại và địa chỉ**: `-30 điểm`

---

## 🤝 Các Lệnh Phát Triển Hệ Thống
* Chạy bộ kiểm thử (Unit tests) để kiểm tra tính toàn vẹn:
  ```bash
  npm run test
  ```
* Biên dịch dự án từ TypeScript sang JavaScript:
  ```bash
  npm run build
  ```