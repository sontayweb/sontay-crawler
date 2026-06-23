import { stringify } from "csv-stringify/sync";
import fs from "fs";
import path from "path";
import { BusinessLead } from "../schemas/lead.schema.js";

/**
 * Exports business leads into a CSV file with a UTF-8 BOM prefix, ensuring Excel compatibility.
 */
export function exportLeadsToCsv(leads: BusinessLead[], outputPath: string): void {
  const columns = [
    "score",
    "businessName",
    "category",
    "area",
    "phone",
    "address",
    "website",
    "facebook",
    "hasWebsite",
    "hasFacebook",
    "source",
    "sourceUrl",
    "scoreReasons",
    "status",
    "notes",
    "scrapedAt"
  ];

  const rows = leads.map((lead) => ({
    score: lead.score,
    businessName: lead.businessName,
    category: lead.category,
    area: lead.area,
    phone: lead.phone || "",
    address: lead.address || "",
    website: lead.website || "",
    facebook: lead.facebook || "",
    hasWebsite: lead.hasWebsite ? "true" : "false",
    hasFacebook: lead.hasFacebook ? "true" : "false",
    source: lead.source,
    sourceUrl: lead.sourceUrl || "",
    scoreReasons: (lead.scoreReasons || []).join(" | "),
    status: lead.status,
    notes: lead.notes || "",
    scrapedAt: lead.scrapedAt
  }));

  const csvContent = stringify(rows, {
    header: true,
    columns: columns,
    cast: {
      boolean: (v) => (v ? "true" : "false")
    }
  });

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Prepend UTF-8 BOM
  fs.writeFileSync(outputPath, "\uFEFF" + csvContent, "utf-8");
}
