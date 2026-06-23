# Son Tay Business Lead Scraper - Prompt trien khai cho AI Code Agent

Ngay: 2026-06-24  
Muc tieu: xay dung cong cu thu thap, lam sach, cham diem va xuat danh sach khach hang tiem nang cho du an multi-tenant SaaS lam website/digital presence cho cua hang, chu kinh doanh tai Son Tay va vung lan can.

> Luu y phap ly: chi thu thap du lieu cong khai, ton trong robots.txt/dieu khoan cua tung nen tang, khong spam, khong vuot captcha, khong thu thap du lieu ca nhan nhay cam. Google Maps Platform Terms co muc "No Scraping", vi vay khong thiet ke crawler bulk de copy/save noi dung tu Google Maps. Neu can du lieu Google, uu tien Places API/doi tac du lieu hop le hoac quy trinh ban thu cong co kiem soat.

## 1. Prompt chinh de dua cho VS Code Agent / Antigravity

Ban la senior full-stack engineer phu trach xay dung mot module `sontay-crawler` bang TypeScript/Node.js cho du an multi-tenant SaaS. Hay doc codebase hien co truoc khi sua. Muc tieu la tao cong cu co the chay doc lap de tao file CSV/JSON lead khach hang dia phuong, dong thoi co the tich hop ve backend sau nay.

Hay trien khai theo huong cong nghe sau:

- Runtime: Node.js 22 LTS hoac Node.js 20 LTS.
- Language: TypeScript.
- Scraping/orchestration: Crawlee + PlaywrightCrawler cho website dong; CheerioCrawler/axios + cheerio cho trang tinh.
- Data validation: zod.
- Output: CSV co UTF-8 BOM de mo bang Excel, JSONL de resume/dedupe tot.
- Storage giai doan 1: file local trong `data/`.
- Storage giai doan 2: MongoDB/Mongoose, co the map sang model lead trong backend.
- CLI: dung `tsx` hoac `ts-node`, co script npm de chay nhanh.
- Khong hard-code selector kho sua; dua selector/source config vao file rieng.

Can tao mot crawler lead dia phuong, khong phai crawler bat chap moi trang. Uu tien chat luong lead, kha nang goi/chao hang, va kha nang demo SaaS cho tung nganh.

## 2. Boi canh san pham

Du an la multi-tenant SaaS cho cua hang dia phuong. Moi khach hang co the co mot tenant website rieng de hien thi dich vu, bang gia, lich hen, review, form lead, lien he, SEO dia phuong va quan tri noi dung.

Khach hang muc tieu ban dau:

- Spa, salon toc, nail.
- Nha hang, quan cafe, quan an.
- Phong kham, nha khoa, vat ly tri lieu.
- Gara oto, sua xe may, dien lanh, dien may.
- Homestay, nha nghi, du lich quanh Son Tay - Ba Vi.
- Shop thoi trang, me va be, my pham.
- Trung tam tieng Anh, lop nang khieu.
- Cua hang co fanpage nhung chua co website rieng.

Khu vuc uu tien:

- Son Tay.
- Ba Vi.
- Phuc Tho.
- Thach That.
- Quoc Oai.
- Dan Phuong.

## 3. Nguon du lieu duoc phep uu tien

Thiet ke crawler theo thu tu uu tien sau:

1. Website cong khai cua doanh nghiep dia phuong.
2. Trang danh ba cong khai co cho phep index/crawl theo dieu khoan va robots.txt.
3. Ket qua tu cong cu tim kiem thong qua API hop le neu co.
4. Facebook/Zalo/TikTok: khong crawl sau, khong login, chi luu link cong khai neu nguoi dung nhap tay hoac nguon cho phep.
5. Google Maps/Google Business: khong bulk scrape. Neu can, tao adapter `google-places-api` rieng, yeu cau API key va luu theo dieu khoan hien hanh.

Khong trien khai:

- Bypass captcha, login wall, paywall.
- Proxy rotation de ne chan neu nen tang cam.
- Auto spam tin nhan, auto comment, auto inbox.
- Thu thap email/so dien thoai ca nhan khong cong khai.

## 4. Du lieu dau vao

CLI can ho tro:

```bash
npm run scrape -- --area="son-tay" --category="spa" --limit=100
npm run scrape -- --query="spa son tay" --limit=100 --out=data/exports/spa-son-tay.csv
npm run scrape -- --config=config/sources.sontay.json --dry-run
npm run score -- --input=data/raw/leads.jsonl --out=data/exports/scored-leads.csv
```

Tham so can co:

- `--query`: tu khoa tu do, vi du `spa son tay`.
- `--area`: khu vuc, vi du `son-tay`, `ba-vi`.
- `--category`: nganh nghe, vi du `spa`, `cafe`, `garage`.
- `--limit`: so lead toi da.
- `--out`: duong dan xuat file.
- `--dry-run`: chay thu, log selector/source, khong ghi DB.
- `--source`: chon adapter, vi du `website-directory`, `search-api`, `manual-import`.
- `--resume`: tiep tuc tu checkpoint.

## 5. Schema lead chuan

Tao type va zod schema:

```ts
export type LeadSource =
  | "public-website"
  | "public-directory"
  | "search-api"
  | "manual-import"
  | "google-places-api";

export type LeadStatus =
  | "new"
  | "qualified"
  | "contacted"
  | "demo_scheduled"
  | "converted"
  | "not_fit"
  | "do_not_contact";

export interface BusinessLead {
  id: string;
  businessName: string;
  normalizedName: string;
  category: string;
  area: string;
  address?: string;
  phone?: string;
  website?: string;
  facebook?: string;
  zalo?: string;
  email?: string;
  hasWebsite: boolean;
  hasFacebook: boolean;
  source: LeadSource;
  sourceUrl?: string;
  evidenceUrls: string[];
  rating?: number;
  reviewCount?: number;
  openingHoursText?: string;
  notes?: string;
  score: number;
  scoreReasons: string[];
  status: LeadStatus;
  contactedAt?: string;
  scrapedAt: string;
  updatedAt: string;
}
```

Quy tac bat buoc:

- `businessName`, `category`, `area`, `source`, `scrapedAt` la bat buoc.
- Phone/email la optional, khong duoc fake.
- `hasWebsite = Boolean(website)`.
- `hasFacebook = Boolean(facebook)`.
- `evidenceUrls` luu URL chung minh thong tin lay tu dau.
- Moi record can co `id` on dinh dua tren hash cua `normalizedName + area + phone/address`.

## 6. Kien truc thu muc mong muon

Tao cau truc:

```text
sontay-crawler/
  package.json
  tsconfig.json
  README.md
  SCRAPER_PROMPT.md
  config/
    categories.json
    areas.json
    sources.sontay.json
  src/
    cli.ts
    index.ts
    config.ts
    logger.ts
    schemas/
      lead.schema.ts
    sources/
      source.types.ts
      publicDirectory.source.ts
      publicWebsite.source.ts
      manualImport.source.ts
      googlePlacesApi.source.ts
    pipeline/
      normalize.ts
      dedupe.ts
      score.ts
      enrich.ts
      exportCsv.ts
      exportJsonl.ts
    storage/
      fileStore.ts
      mongoStore.ts
    utils/
      sleep.ts
      hash.ts
      phone.ts
      url.ts
  data/
    raw/
    processed/
    exports/
  tests/
    normalize.test.ts
    score.test.ts
    dedupe.test.ts
```

Neu muon tich hop vao `multi-tenant-web/backend`, tao module rieng sau khi crawler doc lap chay tot. Khong tron logic scraping vao controller Express ngay tu dau.

## 7. Pipeline xu ly

Can thiet ke pipeline nhu sau:

1. Load config area/category/source.
2. Fetch danh sach URL/record tu source adapter.
3. Parse thanh `BusinessLead`.
4. Normalize ten, so dien thoai, URL, dia chi.
5. Validate bang zod.
6. Dedupe theo phone, website, normalizedName + area.
7. Enrich nhe: detect `hasWebsite`, detect social link, chuan hoa category.
8. Score lead.
9. Export JSONL raw, JSON processed, CSV Excel.
10. Luu checkpoint de resume.

## 8. Quy tac cham diem lead

Muc tieu la uu tien lead co kha nang mua cao cho dich vu website/SaaS.

De xuat scoring 0-100:

- +25 neu co phone cong khai.
- +20 neu co fanpage/social nhung khong co website.
- +15 neu nganh phu hop voi template san co: spa, salon, cafe, nha hang, gara, phong kham.
- +10 neu co dia chi ro trong khu vuc uu tien.
- +10 neu co dau hieu dang kinh doanh tich cuc: reviewCount/rating/openingHours/source moi.
- +10 neu co website cu, cham, khong mobile-friendly hoac domain mien phi.
- -20 neu da co website tot, brand lon, he thong chuoi.
- -30 neu thieu ca phone lan dia chi.
- -100 neu co dau hieu `do not contact` hoac nguon khong duoc phep.

CSV can co cot:

```text
score,businessName,category,area,phone,address,website,facebook,hasWebsite,hasFacebook,source,sourceUrl,scoreReasons,status,notes,scrapedAt
```

## 9. Config nganh va khu vuc

Tao `config/categories.json`:

```json
[
  { "id": "spa", "label": "Spa", "queries": ["spa son tay", "tham my vien son tay", "massage son tay"], "template": "spa" },
  { "id": "salon", "label": "Salon toc", "queries": ["salon toc son tay", "cat toc son tay"], "template": "spa" },
  { "id": "cafe", "label": "Cafe", "queries": ["cafe son tay", "quan cafe son tay"], "template": "restaurant" },
  { "id": "restaurant", "label": "Nha hang/quan an", "queries": ["nha hang son tay", "quan an son tay"], "template": "restaurant" },
  { "id": "garage", "label": "Gara/sua xe", "queries": ["gara oto son tay", "sua xe may son tay"], "template": "repair" },
  { "id": "clinic", "label": "Phong kham/nha khoa", "queries": ["nha khoa son tay", "phong kham son tay"], "template": "clinic" },
  { "id": "homestay", "label": "Homestay/nha nghi", "queries": ["homestay son tay", "nha nghi son tay"], "template": "hotel" }
]
```

Tao `config/areas.json`:

```json
[
  { "id": "son-tay", "label": "Son Tay", "priority": 1 },
  { "id": "ba-vi", "label": "Ba Vi", "priority": 2 },
  { "id": "phuc-tho", "label": "Phuc Tho", "priority": 3 },
  { "id": "thach-that", "label": "Thach That", "priority": 3 },
  { "id": "quoc-oai", "label": "Quoc Oai", "priority": 4 }
]
```

## 10. Tich hop voi backend SaaS

Backend hien co co `Lead` model cho inbound lead cua tenant. Khong nen ghi thang lead prospect vao model do neu chua tach nghia.

De xuat sau giai doan crawler doc lap:

- Tao model moi `ProspectLead`.
- Tao endpoint super-admin:
  - `POST /api/super-admin/prospects/import`
  - `GET /api/super-admin/prospects`
  - `PATCH /api/super-admin/prospects/:id/status`
- UI super-admin co bang lead, loc theo area/category/score/status.
- Khi chot khach, tao tenant tu prospect va lien ket `prospectId`.

Model `ProspectLead` de xuat:

```ts
{
  businessName,
  normalizedName,
  category,
  area,
  phone,
  address,
  website,
  facebook,
  source,
  sourceUrl,
  score,
  scoreReasons,
  status,
  assignedTo,
  contactedAt,
  nextFollowUpAt,
  notes,
  convertedTenantId
}
```

## 11. Yeu cau chat luong code

- TypeScript strict.
- Khong de secret trong code.
- Moi source adapter implement chung interface:

```ts
export interface LeadSourceAdapter {
  name: string;
  canRun(config: SourceConfig): boolean;
  run(input: SourceRunInput): AsyncGenerator<Partial<BusinessLead>>;
}
```

- Co retry/backoff cho request hop le.
- Co rate limit mac dinh than trong.
- Co log tien trinh: query, source, fetched, valid, duplicate, exported.
- Co test unit cho normalize, dedupe, score.
- Co README chay duoc tren Windows PowerShell.

## 12. Acceptance criteria

Hoan thanh khi:

- `npm install` chay duoc trong `sontay-crawler`.
- `npm run build` khong loi TypeScript.
- `npm test` pass cac test normalize/dedupe/score.
- `npm run scrape -- --dry-run --query="spa son tay" --limit=5` chay khong crash.
- Xuat duoc CSV UTF-8 BOM mo bang Excel khong loi tieng Viet.
- JSONL co the resume/dedupe.
- Khong co code bypass captcha/login/paywall.
- README noi ro nguon nao duoc phep, nguon nao can API/nhap tay.

## 13. Roadmap thuc te

Phase 1 - Trong ngay:

- Tao project TypeScript doc lap.
- Tao schema, normalize, dedupe, score, CSV export.
- Ho tro manual import CSV/JSON va source cong khai don gian.
- Xuat danh sach 50-200 lead de di chao hang.

Phase 2 - Sau khi co lead dau tien:

- Them UI super-admin de quan ly prospect.
- Them status/follow-up/notes.
- Them export theo tuyen di: Phung Hung, Chua Thong, Quang Trung, Xuan Khanh, Thanh My.

Phase 3 - Scale an toan:

- Them API hop le cho search/place data.
- Them job queue BullMQ neu can chay nen.
- Them MongoDB store.
- Them dashboard conversion: lead -> contacted -> demo -> converted tenant.

## 14. Checklist di chao hang

Truoc khi di:

- Loc `score >= 60`.
- Uu tien `hasFacebook = true` va `hasWebsite = false`.
- Chia theo tuyen duong/khu vuc.
- Chuan bi demo tenant theo nganh: spa, cafe, gara, phong kham.
- Chuan bi goi gia ro: setup nhanh, ten mien, hosting, form dat lich, SEO local.
- Ghi lai status sau moi lan gap: `contacted`, `demo_scheduled`, `not_fit`, `do_not_contact`.

## 15. Cau lenh goi y

```bash
cd sontay-crawler
npm install
npm run build
npm run scrape -- --area="son-tay" --category="spa" --limit=100 --out="data/exports/son-tay-spa.csv"
npm run score -- --input="data/raw/leads.jsonl" --out="data/exports/scored-leads.csv"
```

## 16. Nguon tham khao cong nghe

- Crawlee: framework scraping JavaScript/Python, co PlaywrightCrawler/CheerioCrawler va xu ly crawling/proxy/session.
- Playwright: browser automation cho Chromium/Firefox/WebKit, phu hop voi trang render bang JavaScript.
- Google Maps Platform Terms: co muc "No Scraping", can tranh bulk scraping Google Maps content va uu tien API/nguon hop le.
