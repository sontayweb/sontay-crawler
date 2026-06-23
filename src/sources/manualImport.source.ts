import fs from "fs";
import { parse } from "csv-parse/sync";
import { BusinessLead } from "../schemas/lead.schema.js";
import { LeadSourceAdapter, SourceConfig, SourceRunInput } from "./source.types.js";
import { logger } from "../logger.js";

export class ManualImportSource implements LeadSourceAdapter {
  name = "manual-import";

  canRun(config: SourceConfig): boolean {
    return config.name === this.name;
  }

  async *run(input: SourceRunInput): AsyncGenerator<Partial<BusinessLead>> {
    // If filePath is passed in config or directly as query
    const filePath = input.config?.filePath || input.query;
    
    if (!filePath) {
      logger.warn("Manual import: No input file path specified.");
      return;
    }

    if (!fs.existsSync(filePath)) {
      logger.warn(`Manual import: File not found at path: ${filePath}`);
      return;
    }

    logger.info(`Starting manual import from file: ${filePath}`);

    try {
      if (filePath.endsWith(".json") || filePath.endsWith(".jsonl")) {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        
        if (filePath.endsWith(".jsonl")) {
          const lines = fileContent.split("\n");
          let count = 0;
          for (const line of lines) {
            if (!line.trim()) continue;
            if (input.limit && count >= input.limit) break;
            try {
              const leadObj = JSON.parse(line);
              leadObj.source = "manual-import";
              yield leadObj;
              count++;
            } catch (err) {
              // Ignore line parse errors
            }
          }
        } else {
          const data = JSON.parse(fileContent);
          const arrayData = Array.isArray(data) ? data : [data];
          let count = 0;
          for (const item of arrayData) {
            if (input.limit && count >= input.limit) break;
            item.source = "manual-import";
            yield item;
            count++;
          }
        }
      } else if (filePath.endsWith(".csv")) {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const records = parse(fileContent, {
          columns: true,
          skip_empty_lines: true,
          bom: true
        });

        let count = 0;
        for (const record of records) {
          if (input.limit && count >= input.limit) break;
          
          const leadObj: Partial<BusinessLead> = {
            businessName: record.businessName || record.name || record.business_name,
            phone: record.phone || record.telephone,
            address: record.address,
            website: record.website || record.url,
            facebook: record.facebook || record.fanpage,
            zalo: record.zalo,
            email: record.email,
            category: record.category || input.category || "unknown",
            area: record.area || input.area || "unknown",
            source: "manual-import",
            notes: record.notes,
            evidenceUrls: record.evidenceUrls ? record.evidenceUrls.split("|") : [filePath]
          };
          
          if (!leadObj.businessName) {
            logger.warn("Manual import: Skipping row due to missing businessName");
            continue;
          }
          
          yield leadObj;
          count++;
        }
      } else {
        logger.error(`Unsupported file type for manual import: ${filePath}`);
      }
    } catch (error: any) {
      logger.error(`Error during manual import execution: ${error.message}`);
    }
  }
}
