import { BusinessLead } from "../schemas/lead.schema.js";
import { logger } from "../logger.js";

/**
 * MongoDB integration scaffold.
 * Ready for Phase 2 when database persistence is enabled in backend.
 */
export class MongoStore {
  async saveLeads(leads: BusinessLead[]): Promise<void> {
    logger.info(`[MongoStore Scaffold] Would save ${leads.length} leads to MongoDB`);
    // Placeholder implementation for Phase 2
    // If you enable MongoDB:
    // const bulkOps = leads.map((lead) => ({
    //   updateOne: {
    //     filter: { id: lead.id },
    //     update: { $set: lead },
    //     upsert: true
    //   }
    // }));
    // await ProspectLeadModel.bulkWrite(bulkOps);
  }
}

/*
Example Mongoose Model definition for Phase 2:

import mongoose from "mongoose";

const ProspectLeadSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    businessName: { type: String, required: true },
    normalizedName: { type: String, required: true },
    category: { type: String, required: true },
    area: { type: String, required: true },
    address: String,
    phone: String,
    website: String,
    facebook: String,
    zalo: String,
    email: String,
    hasWebsite: { type: Boolean, default: false },
    hasFacebook: { type: Boolean, default: false },
    source: { type: String, required: true },
    sourceUrl: String,
    evidenceUrls: [String],
    rating: Number,
    reviewCount: Number,
    openingHoursText: String,
    notes: String,
    score: { type: Number, default: 0 },
    scoreReasons: [String],
    status: { type: String, default: "new" },
    contactedAt: Date,
    scrapedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export const ProspectLeadModel = mongoose.models.ProspectLead || mongoose.model("ProspectLead", ProspectLeadSchema);
*/
