import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { BusinessLead } from "../schemas/lead.schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fallbacks if files are not loaded correctly
let targetTemplates = ["spa", "salon", "cafe", "restaurant", "garage", "clinic", "homestay"];
let priorityAreas = ["son-tay", "ba-vi", "phuc-tho", "thach-that", "quoc-oai"];

try {
  const catPath = path.resolve(__dirname, "../../config/categories.json");
  if (fs.existsSync(catPath)) {
    const categories = JSON.parse(fs.readFileSync(catPath, "utf-8"));
    targetTemplates = categories.map((c: any) => c.id);
  }
} catch (err) {
  // Use fallback silently
}

try {
  const areaPath = path.resolve(__dirname, "../../config/areas.json");
  if (fs.existsSync(areaPath)) {
    const areas = JSON.parse(fs.readFileSync(areaPath, "utf-8"));
    priorityAreas = areas.map((a: any) => a.id);
  }
} catch (err) {
  // Use fallback silently
}

/**
 * Calculates a lead priority score between 0 and 100 based on standard metrics.
 */
export function calculateScore(lead: Partial<BusinessLead>): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // 1. Has public phone number (+25)
  if (lead.phone) {
    score += 25;
    reasons.push("+25: Has public phone number");
  }

  // 2. Has social page but no website (+20)
  if (lead.facebook && !lead.website) {
    score += 20;
    reasons.push("+20: Has social page but no website");
  }

  // 3. Category matches target template (+15)
  if (lead.category && targetTemplates.includes(lead.category.toLowerCase())) {
    score += 15;
    reasons.push(`+15: Category "${lead.category}" matches target SaaS template`);
  }

  // 4. Located in priority area (+10)
  if (lead.area && priorityAreas.includes(lead.area.toLowerCase())) {
    score += 10;
    reasons.push(`+10: Located in priority area "${lead.area}"`);
  }

  // 5. Active business indicators (+10)
  const hasReviews = lead.reviewCount !== undefined && lead.reviewCount > 0;
  const hasRating = lead.rating !== undefined && lead.rating > 0;
  const hasHours = !!lead.openingHoursText;
  if (hasReviews || hasRating || hasHours) {
    score += 10;
    reasons.push("+10: Shows active business indicators (reviews, rating or hours)");
  }

  // 6. Outdated/free website (+10) vs. professional website (-20)
  if (lead.website) {
    const freeDomainKeywords = [
      ".blogspot.",
      ".wordpress.",
      ".wixsite.",
      ".weebly.",
      ".site123",
      ".my-online.store",
      "facebook.com",
      "zalo.me",
      ".github.io"
    ];
    const isFreeOrPoor = freeDomainKeywords.some((keyword) => lead.website!.toLowerCase().includes(keyword)) ||
      (lead.notes && lead.notes.toLowerCase().includes("slow website"));
    
    if (isFreeOrPoor) {
      score += 10;
      reasons.push("+10: Has outdated, slow or free-hosted website");
    } else {
      score -= 20;
      reasons.push("-20: Already has a custom professional website");
    }
  }

  // 7. Missing both phone and address (-30)
  if (!lead.phone && !lead.address) {
    score -= 30;
    reasons.push("-30: Missing both phone number and address");
  }

  // 8. Do not contact / blocked (-100)
  const isDoNotContact = lead.status === "do_not_contact" || 
    (lead.notes && lead.notes.toLowerCase().includes("do not contact"));
  if (isDoNotContact) {
    score -= 100;
    reasons.push("-100: Marked as Do Not Contact");
  }

  // Clamp score to [0, 100]
  const finalScore = Math.max(0, Math.min(100, score));
  return { score: finalScore, reasons };
}
