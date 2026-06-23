import fs from "fs";
import path from "path";
import { BusinessLead } from "../schemas/lead.schema.js";

/**
 * Reads and parses business leads from a JSON Lines (JSONL) file.
 */
export function readLeadsFromJsonl(filePath: string): BusinessLead[] {
  if (!fs.existsSync(filePath)) return [];
  
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const leads: BusinessLead[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      leads.push(JSON.parse(trimmed));
    } catch (err) {
      // Skip invalid JSON lines
    }
  }
  return leads;
}

/**
 * Writes business leads to a JSON Lines (JSONL) file, overwriting the file.
 */
export function writeLeadsToJsonl(leads: BusinessLead[], outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const content = leads.map((lead) => JSON.stringify(lead)).join("\n") + "\n";
  fs.writeFileSync(outputPath, content, "utf-8");
}

/**
 * Appends a single business lead to a JSON Lines (JSONL) file.
 */
export function appendLeadToJsonl(lead: BusinessLead, outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.appendFileSync(outputPath, JSON.stringify(lead) + "\n", "utf-8");
}
