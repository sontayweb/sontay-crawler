/**
 * Standardizes websites and social media URLs.
 */
export function normalizeUrl(url?: string): string | undefined {
  if (!url) return undefined;
  let trimmed = url.trim();
  if (!trimmed) return undefined;
  
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = "https://" + trimmed;
  }
  
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.search = "";
    let result = parsed.toString();
    if (result.endsWith("/") && parsed.pathname === "/") {
      result = result.slice(0, -1);
    }
    return result;
  } catch {
    return undefined;
  }
}
