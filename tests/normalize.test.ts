import { describe, it, expect } from "vitest";
import { normalizeName, normalizeAddress } from "../src/pipeline/normalize.js";
import { normalizePhone } from "../src/utils/phone.js";
import { normalizeUrl } from "../src/utils/url.js";

describe("Normalization Utilities", () => {
  it("should normalize business names with proper capitalization and spacing", () => {
    expect(normalizeName("  spa  son   tay  ")).toBe("Spa Son Tay");
    expect(normalizeName("thẩm mỹ viện Cát Tường")).toBe("Thẩm Mỹ Viện Cát Tường");
    expect(normalizeName("  gArAgE   OTo  ")).toBe("Garage Oto");
  });

  it("should clean up address double spacing", () => {
    expect(normalizeAddress("   123   Chùa   Thông, Sơn Tây   ")).toBe("123 Chùa Thông, Sơn Tây");
    expect(normalizeAddress(undefined)).toBeUndefined();
  });

  it("should normalize Vietnamese mobile and landline phone formats", () => {
    expect(normalizePhone("+84987654321")).toBe("0987654321");
    expect(normalizePhone("84 987 654 321")).toBe("0987654321");
    expect(normalizePhone("0987.654.321")).toBe("0987654321");
    expect(normalizePhone("  0987-654-321  ")).toBe("0987654321");
    expect(normalizePhone("12345")).toBeUndefined(); // Too short
    expect(normalizePhone(undefined)).toBeUndefined();
  });

  it("should normalize website URLs properly", () => {
    expect(normalizeUrl("sontayweb.vn")).toBe("https://sontayweb.vn");
    expect(normalizeUrl("http://sontayweb.vn/")).toBe("http://sontayweb.vn");
    expect(normalizeUrl("https://sontayweb.vn?foo=bar#section")).toBe("https://sontayweb.vn");
    expect(normalizeUrl(undefined)).toBeUndefined();
  });
});
