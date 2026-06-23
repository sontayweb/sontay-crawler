import { BusinessLead } from "../schemas/lead.schema.js";

/**
 * Enriches lead metadata (e.g. hasWebsite, hasFacebook flag, defaults).
 */
export function enrichLead(lead: Partial<BusinessLead>): Partial<BusinessLead> {
  const enriched = { ...lead };
  
  enriched.hasWebsite = !!(enriched.website && enriched.website.trim() !== "");
  enriched.hasFacebook = !!(enriched.facebook && enriched.facebook.trim() !== "");
  
  if (!enriched.status) {
    enriched.status = "new";
  }
  
  if (!enriched.evidenceUrls) {
    enriched.evidenceUrls = [];
  }
  
  if (!enriched.scoreReasons) {
    enriched.scoreReasons = [];
  }
  
  return enriched;
}
