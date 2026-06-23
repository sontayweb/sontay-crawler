import { BusinessLead, BusinessLeadSchema } from "./schemas/lead.schema.js";
import { normalizeLead } from "./pipeline/normalize.js";
import { enrichLead } from "./pipeline/enrich.js";
import { calculateScore } from "./pipeline/score.js";
import { dedupeLeads } from "./pipeline/dedupe.js";
import { generateLeadId } from "./utils/hash.js";
import { ManualImportSource } from "./sources/manualImport.source.js";
import { GooglePlacesApiSource } from "./sources/googlePlacesApi.source.js";
import { PublicDirectorySource } from "./sources/publicDirectory.source.js";
import { PublicWebsiteSource } from "./sources/publicWebsite.source.js";
import { DuckDuckGoSearchSource } from "./sources/duckduckgoSearch.source.js";
import { FacebookCdpSource } from "./sources/facebookCdp.source.js";
import { FileStore } from "./storage/fileStore.js";
import { writeLeadsToJsonl } from "./pipeline/exportJsonl.js";
import { exportLeadsToCsv } from "./pipeline/exportCsv.js";
import { logger } from "./logger.js";
import fs from "fs";
import path from "path";

export interface ScrapeOptions {
  query?: string;
  area?: string;
  category?: string;
  limit?: number;
  out?: string;
  dryRun?: boolean;
  source?: string;
  config?: string;
  resume?: boolean;
}

export async function runScrapePipeline(options: ScrapeOptions) {
  logger.info("Initializing scrape pipeline with options: " + JSON.stringify(options));

  // 1. Load config if available
  let sourceConfigs: any[] = [];
  if (options.config && fs.existsSync(options.config)) {
    try {
      const configData = JSON.parse(fs.readFileSync(options.config, "utf-8"));
      sourceConfigs = configData.sources || [];
    } catch (err: any) {
      logger.error(`Failed to parse config file: ${err.message}`);
    }
  } else {
    // Default fallback configurations
    sourceConfigs = [
      { name: "manual-import", type: "manual-import", enabled: true },
      { name: "google-places-api", type: "google-places-api", enabled: true },
      { name: "search-api", type: "search-api", enabled: true },
      { name: "facebook-cdp", type: "facebook-cdp", enabled: true },
      { name: "public-directory", type: "public-directory", enabled: true },
      { name: "public-website", type: "public-website", enabled: false }
    ];
  }

  // 2. Instantiate adapters
  const adapters = [
    new ManualImportSource(),
    new GooglePlacesApiSource(),
    new DuckDuckGoSearchSource(),
    new FacebookCdpSource(),
    new PublicDirectorySource(),
    new PublicWebsiteSource()
  ];

  const fileStore = new FileStore();
  const rawLeads: BusinessLead[] = [];

  // 3. Run each active adapter
  for (const adapter of adapters) {
    // Check if filtered by --source CLI flag
    if (options.source && adapter.name !== options.source) {
      continue;
    }

    // Find config for this adapter
    const adapterConfig = sourceConfigs.find(
      (c) => c.name === adapter.name || c.type === adapter.name
    ) || { enabled: true };
    
    if (!adapterConfig.enabled && !options.source) {
      logger.debug(`Adapter ${adapter.name} is disabled in config.`);
      continue;
    }

    logger.info(`Running adapter: ${adapter.name}`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rawFileName = `raw_${options.category || "leads"}_${options.area || "area"}_${timestamp}.jsonl`;
    const outPath = options.out || path.join("data", "exports", `leads_${timestamp}.csv`);
    const resolvedOutPath = path.resolve(outPath);

    const saveLeadsToDisk = (leadsArray: BusinessLead[]) => {
      if (options.dryRun || leadsArray.length === 0) return;

      // 1. Save raw leads
      fileStore.saveRawLeads(leadsArray, rawFileName);

      // 2. Load existing processed leads for deduplication/resume if enabled
      let existingLeads: BusinessLead[] = [];
      const processedPath = path.join("data", "processed", "leads.jsonl");
      if (fs.existsSync(processedPath)) {
        existingLeads = fileStore.loadProcessedLeads("leads.jsonl");
      }

      // Deduplicate and merge
      const dedupedLeads = dedupeLeads(existingLeads, leadsArray);

      // Save to processed leads.jsonl
      fileStore.saveProcessedLeads(dedupedLeads, "leads.jsonl");

      // Export to CSV
      exportLeadsToCsv(dedupedLeads, resolvedOutPath);
    };

    try {
      const runInput = {
        query: options.query,
        area: options.area,
        category: options.category,
        limit: options.limit,
        config: adapterConfig,
        dryRun: options.dryRun
      };

      for await (const rawLead of adapter.run(runInput)) {
        // Normalization
        const normalized = normalizeLead(rawLead);
        
        // Enrichment
        const enriched = enrichLead(normalized);

        // Scoring
        const scoreResult = calculateScore(enriched);
        enriched.score = scoreResult.score;
        enriched.scoreReasons = scoreResult.reasons;

        // Generate stable unique ID
        const idSrc = enriched.phone || enriched.website || enriched.facebook || enriched.sourceUrl || enriched.address || enriched.businessName || "";
        enriched.id = generateLeadId(enriched.normalizedName || "", enriched.area || "unknown", idSrc);
        
        const timestampIso = new Date().toISOString();
        enriched.scrapedAt = enriched.scrapedAt || timestampIso;
        enriched.updatedAt = timestampIso;

        // Zod validation
        const validation = BusinessLeadSchema.safeParse(enriched);
        if (validation.success) {
          rawLeads.push(validation.data);
          // Save incrementally in real-time
          saveLeadsToDisk(rawLeads);
        } else {
          logger.warn(`Lead validation failed for "${enriched.businessName}": ` + JSON.stringify(validation.error.format()));
        }
      }
    } catch (err: any) {
      logger.error(`Adapter ${adapter.name} failed: ${err.message}`);
    }
  }

  logger.info(`Scraping finished. Collected ${rawLeads.length} valid raw leads.`);

  if (options.dryRun) {
    logger.info("[Dry Run] Skipping file saving operations.");
    rawLeads.forEach((lead) => {
      logger.info(`[Dry Run Lead] ${lead.businessName} - Score: ${lead.score} (Reasons: ${lead.scoreReasons.join(", ")})`);
    });
    return;
  }

  if (rawLeads.length === 0) {
    logger.warn("No leads collected. Output file will not be created.");
    return;
  }

  logger.success("Scrape pipeline completed successfully!");
}

export function runScorePipeline(inputPath: string, outputPath: string) {
  logger.info(`Running scoring pipeline. Input: ${inputPath}, Output: ${outputPath}`);
  
  if (!fs.existsSync(inputPath)) {
    logger.error(`Input file not found: ${inputPath}`);
    return;
  }

  let leads: any[] = [];
  try {
    const content = fs.readFileSync(inputPath, "utf-8");
    const lines = content.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        leads.push(JSON.parse(line));
      } catch (e) {
        // Skip bad lines
      }
    }
  } catch (err: any) {
    logger.error(`Error reading input file: ${err.message}`);
    return;
  }

  logger.info(`Loaded ${leads.length} leads. Recalculating scores and normalizing...`);

  const processedLeads: BusinessLead[] = [];

  for (const lead of leads) {
    const normalized = normalizeLead(lead);
    const enriched = enrichLead(normalized);
    const scoreResult = calculateScore(enriched);
    
    enriched.score = scoreResult.score;
    enriched.scoreReasons = scoreResult.reasons;
    
    const idSrc = enriched.phone || enriched.website || enriched.address || enriched.businessName || "";
    enriched.id = enriched.id || generateLeadId(enriched.normalizedName || "", enriched.area || "unknown", idSrc);
    
    const timestampIso = new Date().toISOString();
    enriched.scrapedAt = enriched.scrapedAt || timestampIso;
    enriched.updatedAt = timestampIso;

    const validation = BusinessLeadSchema.safeParse(enriched);
    if (validation.success) {
      processedLeads.push(validation.data);
    } else {
      logger.warn(`Validation failed during scoring for "${enriched.businessName}": ` + JSON.stringify(validation.error.format()));
    }
  }

  // Deduplicate
  const deduped = dedupeLeads([], processedLeads);

  // Save/Export
  const resolvedOutPath = path.resolve(outputPath);
  if (resolvedOutPath.endsWith(".csv")) {
    exportLeadsToCsv(deduped, resolvedOutPath);
  } else {
    writeLeadsToJsonl(deduped, resolvedOutPath);
  }

  logger.success(`Scoring pipeline completed. Processed and saved ${deduped.length} leads.`);
}
