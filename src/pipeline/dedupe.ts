import { BusinessLead } from "../schemas/lead.schema.js";

/**
 * Checks if two business leads are duplicates based on phone, website, or normalizedName + area.
 */
export function areLeadsDuplicate(a: Partial<BusinessLead>, b: Partial<BusinessLead>): boolean {
  if (a.phone && b.phone && a.phone === b.phone) return true;
  if (a.website && b.website && a.website === b.website) return true;
  
  if (a.normalizedName && b.normalizedName && a.area && b.area) {
    const nameA = a.normalizedName.toLowerCase().replace(/\s+/g, "");
    const nameB = b.normalizedName.toLowerCase().replace(/\s+/g, "");
    if (nameA === nameB && a.area.toLowerCase() === b.area.toLowerCase()) {
      return true;
    }
  }
  return false;
}

/**
 * Merges an incoming lead into an existing lead, preserving the best information.
 */
export function mergeLeads(existing: BusinessLead, incoming: Partial<BusinessLead>): BusinessLead {
  const merged = { ...existing };
  
  if (!merged.phone && incoming.phone) merged.phone = incoming.phone;
  if (!merged.address && incoming.address) merged.address = incoming.address;
  if (!merged.website && incoming.website) merged.website = incoming.website;
  if (!merged.facebook && incoming.facebook) merged.facebook = incoming.facebook;
  if (!merged.zalo && incoming.zalo) merged.zalo = incoming.zalo;
  if (!merged.email && incoming.email) merged.email = incoming.email;
  if (!merged.openingHoursText && incoming.openingHoursText) merged.openingHoursText = incoming.openingHoursText;
  
  if (incoming.notes) {
    if (!merged.notes) {
      merged.notes = incoming.notes;
    } else if (merged.notes !== incoming.notes && !merged.notes.includes(incoming.notes)) {
      merged.notes = `${merged.notes}; ${incoming.notes}`;
    }
  }
  
  if (incoming.evidenceUrls) {
    const combined = new Set([...merged.evidenceUrls, ...incoming.evidenceUrls]);
    merged.evidenceUrls = Array.from(combined);
  }
  
  if (incoming.rating !== undefined && (merged.rating === undefined || incoming.rating > merged.rating)) {
    merged.rating = incoming.rating;
  }
  if (incoming.reviewCount !== undefined && (merged.reviewCount === undefined || incoming.reviewCount > merged.reviewCount)) {
    merged.reviewCount = incoming.reviewCount;
  }
  
  const statusPrecedence: Record<string, number> = {
    "do_not_contact": -1,
    "not_fit": 0,
    "new": 1,
    "qualified": 2,
    "contacted": 3,
    "demo_scheduled": 4,
    "converted": 5
  };
  
  if (incoming.status && (statusPrecedence[incoming.status] || 0) > (statusPrecedence[merged.status] || 0)) {
    merged.status = incoming.status;
  }
  
  // Combine score reasons if they differ
  if (incoming.scoreReasons) {
    const combinedReasons = new Set([...merged.scoreReasons, ...incoming.scoreReasons]);
    merged.scoreReasons = Array.from(combinedReasons);
  }
  
  // Take highest score
  if (incoming.score !== undefined && incoming.score > merged.score) {
    merged.score = incoming.score;
  }
  
  merged.updatedAt = new Date().toISOString();
  return merged;
}

/**
 * Deduplicates in-memory arrays of leads.
 */
export function dedupeLeads(existing: BusinessLead[], incoming: BusinessLead[]): BusinessLead[] {
  const result = [...existing];
  
  for (const newLead of incoming) {
    const matchIndex = result.findIndex((lead) => areLeadsDuplicate(lead, newLead));
    if (matchIndex !== -1) {
      result[matchIndex] = mergeLeads(result[matchIndex], newLead);
    } else {
      result.push(newLead);
    }
  }
  
  return result;
}
