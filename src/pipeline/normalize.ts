import { BusinessLead } from "../schemas/lead.schema.js";
import { normalizePhone } from "../utils/phone.js";
import { normalizeUrl } from "../utils/url.js";

/**
 * Normalizes a raw business name.
 */
export function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Normalizes address whitespace.
 */
export function normalizeAddress(address?: string): string | undefined {
  if (!address) return undefined;
  return address.trim().replace(/\s+/g, " ");
}

/**
 * Normalizes all fields of a business lead.
 */
export function normalizeLead(lead: Partial<BusinessLead>): Partial<BusinessLead> {
  const normalized = { ...lead };
  
  if (normalized.businessName) {
    normalized.normalizedName = normalizeName(normalized.businessName);
  }
  if (normalized.phone) {
    normalized.phone = normalizePhone(normalized.phone);
  }
  if (normalized.website) {
    normalized.website = normalizeUrl(normalized.website);
  }
  if (normalized.facebook) {
    normalized.facebook = normalizeUrl(normalized.facebook);
  }
  if (normalized.address) {
    normalized.address = normalizeAddress(normalized.address);
  }
  
  return normalized;
}
