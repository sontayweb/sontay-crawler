import fs from "fs";
import path from "path";
import { BusinessLead } from "../schemas/lead.schema.js";
import { readLeadsFromJsonl, writeLeadsToJsonl } from "../pipeline/exportJsonl.js";
import { exportLeadsToCsv } from "../pipeline/exportCsv.js";
import { logger } from "../logger.js";

export class FileStore {
  private baseDir: string;

  constructor(baseDir: string = "data") {
    this.baseDir = path.resolve(baseDir);
    this.ensureDirs();
  }

  private ensureDirs() {
    fs.mkdirSync(path.join(this.baseDir, "raw"), { recursive: true });
    fs.mkdirSync(path.join(this.baseDir, "processed"), { recursive: true });
    fs.mkdirSync(path.join(this.baseDir, "exports"), { recursive: true });
  }

  loadRawLeads(fileName: string): BusinessLead[] {
    const filePath = path.join(this.baseDir, "raw", fileName);
    return readLeadsFromJsonl(filePath);
  }

  saveRawLeads(leads: BusinessLead[], fileName: string): void {
    const filePath = path.join(this.baseDir, "raw", fileName);
    writeLeadsToJsonl(leads, filePath);
    logger.info(`Saved ${leads.length} raw leads to ${filePath}`);
  }

  loadProcessedLeads(fileName: string): BusinessLead[] {
    const filePath = path.join(this.baseDir, "processed", fileName);
    return readLeadsFromJsonl(filePath);
  }

  saveProcessedLeads(leads: BusinessLead[], fileName: string): void {
    const filePath = path.join(this.baseDir, "processed", fileName);
    writeLeadsToJsonl(leads, filePath);
    logger.info(`Saved ${leads.length} processed leads to ${filePath}`);
  }

  exportToCsv(leads: BusinessLead[], fileName: string): void {
    const filePath = path.join(this.baseDir, "exports", fileName);
    exportLeadsToCsv(leads, filePath);
    logger.info(`Exported ${leads.length} leads to CSV: ${filePath}`);
  }
}
