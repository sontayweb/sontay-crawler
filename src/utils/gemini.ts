import { logger } from "../logger.js";

export interface CleanedLead {
  isBusinessLead: boolean;
  businessName: string;
  phone: string;
  address: string;
  website: string;
  category: string;
  notes: string;
}

/**
 * Clean raw Facebook text using Gemini API with structured JSON output.
 */
export async function cleanLeadWithGemini(
  text: string,
  author: string,
  keyword: string,
  area: string
): Promise<CleanedLead | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

  if (!apiKey) {
    logger.warn("GEMINI_API_KEY is not defined in environment variables. Falling back to local heuristics.");
    return null;
  }

  const prompt = `
Bạn là một chuyên gia phân tích dữ liệu mạng xã hội Việt Nam. 
Hãy phân tích nội dung sau đây được cào từ Facebook (có thể là bài đăng hoặc profile cá nhân).
Từ khóa tìm kiếm của người dùng là: "${keyword}".
Khu vực ưu tiên là: "${area}".

Nội dung:
"${text}"

Hãy trích xuất và chuẩn hóa thông tin:
1. "isBusinessLead": Đặt là true nếu đây THỰC SỰ là một chủ cửa hàng, chủ hộ kinh doanh, người cung cấp dịch vụ hoặc bài đăng quảng cáo dịch vụ/sản phẩm (ví dụ: mở spa, bán bánh kem, sửa xe, dịch vụ chụp ảnh...). Đặt là false nếu là bài đăng cá nhân chia sẻ đời sống, hỏi han chung chung mà không phải người kinh doanh.
2. "businessName": Tên thương hiệu, tên cửa hàng, hoặc tên Facebook của người kinh doanh (ví dụ: "Phượng beauty spa", "Leemyl Spa"). Nếu không thể xác định được tên thương hiệu cụ thể, hãy trả về "${author}".
3. "phone": Số điện thoại liên hệ tìm được trong văn bản. Nếu không có, để trống "".
4. "address": Địa chỉ chi tiết (nếu có, ví dụ: "57 Phạm Hồng Thái, Sơn Tây"). Nếu không có, để trống "".
5. "website": Link trang web hoặc link fanpage (nếu có). Nếu không có, để trống "".
6. "category": Lĩnh vực kinh doanh tương ứng (ví dụ: "spa", "cafe", "restaurant", "garage", "clinic", "homestay", "studio", v.v.).
7. "notes": Tóm tắt ngắn gọn dịch vụ/sản phẩm họ kinh doanh (không quá 150 ký tự).

Chú ý: Trả về kết quả dưới định dạng JSON khớp hoàn toàn với schema yêu cầu.
`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              isBusinessLead: { type: "boolean" },
              businessName: { type: "string" },
              phone: { type: "string" },
              address: { type: "string" },
              website: { type: "string" },
              category: { type: "string" },
              notes: { type: "string" },
            },
            required: [
              "isBusinessLead",
              "businessName",
              "phone",
              "address",
              "website",
              "category",
              "notes",
            ],
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Gemini API returned error ${response.status}: ${errorText}`);
      return null;
    }

    const data = (await response.json()) as any;
    const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonText) {
      logger.error("Gemini response is empty or missing content parts.");
      return null;
    }

    const parsed = JSON.parse(jsonText) as CleanedLead;
    return parsed;
  } catch (err: any) {
    logger.error(`Failed to analyze lead with Gemini: ${err.message}`);
    return null;
  }
}
