import { describe, it, expect } from "vitest";
import { containsBusinessKeyword, processFacebookElement } from "../src/sources/facebookCdp.source.js";

describe("Facebook CDP Source Helper Functions", () => {
  describe("containsBusinessKeyword", () => {
    it("should match valid business keywords in different cases", () => {
      expect(containsBusinessKeyword("Phượng Beauty Spa")).toBe(true);
      expect(containsBusinessKeyword("Quán Cafe Yên Tĩnh")).toBe(true);
      expect(containsBusinessKeyword("Gara ô tô Sơn Tây")).toBe(true);
      expect(containsBusinessKeyword("Nha Khoa Thẩm Mỹ")).toBe(true);
    });

    it("should return false for strings without business keywords", () => {
      expect(containsBusinessKeyword("Hồng Nguyễn")).toBe(false);
      expect(containsBusinessKeyword("Xin chào mọi người")).toBe(false);
      expect(containsBusinessKeyword("Thời tiết Sơn Tây hôm nay")).toBe(false);
    });
  });

  describe("processFacebookElement", () => {
    it("should process a profile card with a business name and no phone successfully", () => {
      const mockProfile = {
        author: "Đoàn Phượng (Phượng beauty spa)",
        text: "Làm việc tại Chăm sóc da và spa Sống tại Sơn Tây",
        link: "https://www.facebook.com/profile.php?id=123",
        type: "profile"
      };
      const result = processFacebookElement(mockProfile, "spa", "son-tay");
      expect(result).not.toBeNull();
      expect(result?.businessName).toBe("Đoàn Phượng (Phượng beauty spa)");
      expect(result?.phone).toBeUndefined();
      expect(result?.facebook).toBe("https://www.facebook.com/profile.php?id=123");
    });

    it("should process a post containing a phone number successfully even without keywords", () => {
      const mockPost = {
        author: "Boo Nguyễn",
        text: "Ai cần mua bán nhà ở Sơn Tây alo mình nhé 0987654321",
        link: "https://www.facebook.com/groups/posts/456",
        type: "post"
      };
      const result = processFacebookElement(mockPost, "real-estate", "son-tay");
      expect(result).not.toBeNull();
      expect(result?.phone).toBe("0987654321");
      expect(result?.businessName).toBe("Boo Nguyễn");
    });

    it("should return null for an irrelevant post without phone number or business keywords", () => {
      const mockPost = {
        author: "Nguyễn Văn A",
        text: "Hôm nay trời đẹp quá cả nhà ơi",
        link: "https://www.facebook.com/groups/posts/789",
        type: "post"
      };
      const result = processFacebookElement(mockPost, "general", "son-tay");
      expect(result).toBeNull();
    });
  });
});
