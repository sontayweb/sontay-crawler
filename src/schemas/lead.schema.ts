import { z } from "zod";

export const LeadSourceSchema = z.enum([
  "public-website",
  "public-directory",
  "search-api",
  "manual-import",
  "google-places-api"
]);

export const LeadStatusSchema = z.enum([
  "new",
  "qualified",
  "contacted",
  "demo_scheduled",
  "converted",
  "not_fit",
  "do_not_contact"
]);

export const BusinessLeadSchema = z.object({
  id: z.string(),
  businessName: z.string().min(1),
  normalizedName: z.string().min(1),
  category: z.string().min(1),
  area: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  facebook: z.string().optional(),
  zalo: z.string().optional(),
  email: z.string().optional(),
  hasWebsite: z.boolean(),
  hasFacebook: z.boolean(),
  source: LeadSourceSchema,
  sourceUrl: z.string().optional(),
  evidenceUrls: z.array(z.string()),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().min(0).optional(),
  openingHoursText: z.string().optional(),
  notes: z.string().optional(),
  score: z.number().int().min(-100).max(100),
  scoreReasons: z.array(z.string()),
  status: LeadStatusSchema,
  contactedAt: z.string().optional(),
  scrapedAt: z.string(),
  updatedAt: z.string()
});

export type LeadSource = z.infer<typeof LeadSourceSchema>;
export type LeadStatus = z.infer<typeof LeadStatusSchema>;
export type BusinessLead = z.infer<typeof BusinessLeadSchema>;
