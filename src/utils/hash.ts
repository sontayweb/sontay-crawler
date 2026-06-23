import crypto from "crypto";

/**
 * Generates a stable unique ID for a business lead based on its key identifying fields.
 */
export function generateLeadId(normalizedName: string, area: string, identifier?: string): string {
  const cleanName = normalizedName.trim().toLowerCase();
  const cleanArea = area.trim().toLowerCase();
  const cleanId = (identifier || "").trim().toLowerCase();
  const data = `${cleanName}_${cleanArea}_${cleanId}`;
  return crypto.createHash("md5").update(data).digest("hex");
}
