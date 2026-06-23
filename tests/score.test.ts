import { describe, it, expect } from "vitest";
import { calculateScore } from "../src/pipeline/score.js";

describe("Lead Scoring Logic", () => {
  it("should calculate positive score component for public phone", () => {
    const res = calculateScore({ phone: "0987654321" });
    expect(res.score).toBe(25);
    expect(res.reasons).toContain("+25: Has public phone number");
  });

  it("should award score for target SaaS templates and priority areas", () => {
    const res = calculateScore({ category: "spa", area: "son-tay", address: "Sơn Tây, Hà Nội" });
    expect(res.score).toBe(25); // 15 + 10, no missing contact penalty because address is present
    expect(res.reasons.some((r) => r.includes("+15"))).toBe(true);
    expect(res.reasons.some((r) => r.includes("+10"))).toBe(true);
  });

  it("should apply penalty for professional website and boost for free website builder", () => {
    const professionalRes = calculateScore({ website: "https://professional.com", address: "Sơn Tây" });
    expect(professionalRes.reasons.some((r) => r.includes("-20"))).toBe(true);

    const blogspotRes = calculateScore({ website: "https://myspa.blogspot.com", address: "Sơn Tây" });
    expect(blogspotRes.score).toBe(10);
    expect(blogspotRes.reasons.some((r) => r.includes("+10"))).toBe(true);
  });

  it("should apply severe penalty for Do Not Contact status", () => {
    const res = calculateScore({ status: "do_not_contact" });
    expect(res.score).toBe(0); // Clamped at 0
    expect(res.reasons.some((r) => r.includes("-100"))).toBe(true);
  });
});
