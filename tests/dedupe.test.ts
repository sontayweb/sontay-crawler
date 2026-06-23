import { describe, it, expect } from "vitest";
import { areLeadsDuplicate, mergeLeads, dedupeLeads } from "../src/pipeline/dedupe.js";
import { BusinessLead } from "../src/schemas/lead.schema.js";

describe("Lead Deduplication and Merging", () => {
  it("should flag duplicates by matching phone or website", () => {
    expect(areLeadsDuplicate({ phone: "0987654321" }, { phone: "0987654321" })).toBe(true);
    expect(areLeadsDuplicate({ website: "https://my.vn" }, { website: "https://my.vn" })).toBe(true);
    expect(areLeadsDuplicate({ phone: "0987654321" }, { phone: "0111111111" })).toBe(false);
  });

  it("should flag duplicates by matching normalizedName + area", () => {
    const a = { normalizedName: "Thẩm Mỹ Viện Cát Tường", area: "son-tay" };
    const b = { normalizedName: "  thẩm mỹ viện cát tường ", area: "son-tay" };
    expect(areLeadsDuplicate(a, b)).toBe(true);
  });

  it("should merge incoming data properly with priority updates", () => {
    const base: BusinessLead = {
      id: "abc",
      businessName: "Cát Tường Spa",
      normalizedName: "Cát Tường Spa",
      category: "spa",
      area: "son-tay",
      phone: "0987654321",
      hasWebsite: false,
      hasFacebook: false,
      source: "public-directory",
      evidenceUrls: ["url-a"],
      score: 40,
      scoreReasons: ["has phone"],
      status: "new",
      scrapedAt: "2026-06-24T00:00:00Z",
      updatedAt: "2026-06-24T00:00:00Z"
    };

    const incoming = {
      website: "https://cattuongspa.vn",
      facebook: "https://facebook.com/cattuongspa",
      evidenceUrls: ["url-b"],
      score: 60,
      scoreReasons: ["has website"],
      status: "qualified" as const
    };

    const merged = mergeLeads(base, incoming);

    expect(merged.phone).toBe("0987654321");
    expect(merged.website).toBe("https://cattuongspa.vn");
    expect(merged.facebook).toBe("https://facebook.com/cattuongspa");
    expect(merged.evidenceUrls).toContain("url-a");
    expect(merged.evidenceUrls).toContain("url-b");
    expect(merged.score).toBe(60);
    expect(merged.status).toBe("qualified");
  });
});
