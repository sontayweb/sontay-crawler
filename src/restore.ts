import fs from "fs";
import path from "path";
import { normalizeLead } from "./pipeline/normalize.js";
import { enrichLead } from "./pipeline/enrich.js";
import { calculateScore } from "./pipeline/score.js";
import { dedupeLeads } from "./pipeline/dedupe.js";
import { generateLeadId } from "./utils/hash.js";
import { BusinessLead, BusinessLeadSchema } from "./schemas/lead.schema.js";
import { FileStore } from "./storage/fileStore.js";
import { exportLeadsToCsv } from "./pipeline/exportCsv.js";
import { logger } from "./logger.js";

async function restore() {
  logger.info("Starting recovery of raw lead files...");
  const rawDir = path.resolve("data/raw");
  if (!fs.existsSync(rawDir)) {
    logger.error("Raw directory does not exist.");
    return;
  }

  const files = fs.readdirSync(rawDir).filter(f => f.startsWith("raw_") && f.endsWith(".jsonl"));
  logger.info(`Found ${files.length} raw files to restore.`);

  const fileStore = new FileStore();
  const allLeads: BusinessLead[] = [];

  for (const file of files) {
    const filePath = path.join(rawDir, file);
    logger.info(`Processing ${file}...`);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        const rawLead = JSON.parse(line);

        // Normalize
        const normalized = normalizeLead(rawLead);
        
        // Enrich
        const enriched = enrichLead(normalized);

        // Score
        const scoreResult = calculateScore(enriched);
        enriched.score = scoreResult.score;
        enriched.scoreReasons = scoreResult.reasons;

        // Stable unique ID
        const idSrc = enriched.phone || enriched.website || enriched.facebook || enriched.sourceUrl || enriched.address || enriched.businessName || "";
        enriched.id = generateLeadId(enriched.normalizedName || "", enriched.area || "unknown", idSrc);
        
        const timestampIso = new Date().toISOString();
        enriched.scrapedAt = enriched.scrapedAt || timestampIso;
        enriched.updatedAt = timestampIso;

        // Validate
        const validation = BusinessLeadSchema.safeParse(enriched);
        if (validation.success) {
          allLeads.push(validation.data);
        } else {
          logger.warn(`Skipped invalid raw lead line in ${file}: ` + JSON.stringify(validation.error.format()));
        }
      }
    } catch (err: any) {
      logger.error(`Error processing file ${file}: ${err.message}`);
    }
  }

  logger.info(`Successfully parsed ${allLeads.length} total lead candidates from raw files.`);

  // Load existing leads in database
  let existingLeads: BusinessLead[] = [];
  const processedPath = path.resolve("data/processed/leads.jsonl");
  if (fs.existsSync(processedPath)) {
    existingLeads = fileStore.loadProcessedLeads("leads.jsonl");
  }

  // Deduplicate and merge
  const mergedLeads = dedupeLeads(existingLeads, allLeads);
  logger.info(`After deduplication and merging, total unique leads in database: ${mergedLeads.length}`);

  // Save to database
  fileStore.saveProcessedLeads(mergedLeads, "leads.jsonl");
  logger.success("Updated data/processed/leads.jsonl successfully.");

  // Export to CSV
  const outPath = path.resolve("data/exports/facebook_leads_restored.csv");
  exportLeadsToCsv(mergedLeads, outPath);
  logger.success(`Restored leads exported to: ${outPath}`);
}

restore().catch(err => {
  logger.error("Restore failed: " + err.message);
});
