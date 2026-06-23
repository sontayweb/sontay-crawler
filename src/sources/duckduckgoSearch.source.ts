import { BusinessLead } from "../schemas/lead.schema.js";
import { LeadSourceAdapter, SourceConfig, SourceRunInput } from "./source.types.js";
import { logger } from "../logger.js";
import { normalizePhone } from "../utils/phone.js";
import { normalizeUrl } from "../utils/url.js";
import * as cheerio from "cheerio";

export class DuckDuckGoSearchSource implements LeadSourceAdapter {
  name = "search-api"; // Map to "search-api" LeadSource type

  canRun(config: SourceConfig): boolean {
    return config.name === this.name || config.type === this.name || config.name === "duckduckgo-search";
  }

  async *run(input: SourceRunInput): AsyncGenerator<Partial<BusinessLead>> {
    const query = input.query || `${input.category || ""} ${input.area || ""}`.trim();
    if (!query) {
      logger.warn("DuckDuckGo Search Source requires a query, category, or area parameter.");
      return;
    }

    logger.info(`Searching DuckDuckGo (HTML) for: "${query}"`);
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    try {
      const response = await fetch(ddgUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      if (!response.ok) {
        throw new Error(`DuckDuckGo responded with status code ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      
      const resultElements = $(".result");
      logger.info(`DuckDuckGo found ${resultElements.length} search result candidates.`);

      let count = 0;
      for (let i = 0; i < resultElements.length; i++) {
        if (input.limit && count >= input.limit) break;

        const element = resultElements.eq(i);
        const titleAnchor = element.find(".result__title a");
        const titleText = titleAnchor.text().trim();
        const snippetText = element.find(".result__snippet").text().trim();
        const rawHref = titleAnchor.attr("href");

        if (!titleText || !rawHref) continue;

        // Parse DuckDuckGo redirection link
        let destinationUrl: string | undefined = rawHref;
        try {
          let fullUrl = rawHref;
          if (rawHref.startsWith("//")) {
            fullUrl = "https:" + rawHref;
          } else if (rawHref.startsWith("/")) {
            fullUrl = "https://html.duckduckgo.com" + rawHref;
          }
          const parsedUrl = new URL(fullUrl);
          const uddg = parsedUrl.searchParams.get("uddg");
          if (uddg) {
            destinationUrl = uddg;
          } else {
            destinationUrl = fullUrl;
          }
        } catch {
          destinationUrl = rawHref;
        }

        // Clean business name (remove common title tags)
        let businessName = titleText
          .replace(/[-|] (Facebook|Trang chủ|Instagram|YouTube|Website chính thức|LinkedIn|TikTok|Map|Maps|Google Maps)/gi, "")
          .replace(/Top \d+ .*/gi, "")
          .trim();

        // Standardize URLs
        const cleanUrl = normalizeUrl(destinationUrl);
        let website: string | undefined;
        let facebook: string | undefined;

        if (cleanUrl) {
          if (cleanUrl.includes("facebook.com/")) {
            facebook = cleanUrl;
          } else if (!cleanUrl.includes("duckduckgo.com/") && 
                     !cleanUrl.includes("google.com/") && 
                     !cleanUrl.includes("youtube.com/") && 
                     !cleanUrl.includes("map") &&
                     !cleanUrl.includes("toplist") &&
                     !cleanUrl.includes("trangvang") &&
                     !cleanUrl.includes("timdiadiem") &&
                     !cleanUrl.includes("foody") &&
                     !cleanUrl.includes("riviu") &&
                     !cleanUrl.includes("checkin") &&
                     !cleanUrl.includes("danhbadoanhnghiep") &&
                     !cleanUrl.includes("hosocongty") &&
                     !cleanUrl.includes("mst") &&
                     !cleanUrl.includes("thongtincongty")) {
            website = cleanUrl;
          }
        }

        // Skip general listings/directories to keep leads high-quality
        if (!website && !facebook) {
          continue;
        }

        // Search for phone numbers in the snippet
        // Vietnamese phone: e.g. 09xx.xxx.xxx, 09xxxxxxxx, +84...
        const phoneRegex = /(?:\+84|0)[35789][0-9]{8}/g;
        const matches = snippetText.match(phoneRegex);
        const phone = matches ? normalizePhone(matches[0]) : undefined;

        // Parse address if keyword exists in snippet
        let address: string | undefined;
        const addrIndex = snippetText.toLowerCase().indexOf("địa chỉ:");
        if (addrIndex !== -1) {
          const rawAddr = snippetText.slice(addrIndex + 8).split(".")[0].split("-")[0].trim();
          if (rawAddr.length > 5) {
            address = rawAddr;
          }
        }

        const lead: Partial<BusinessLead> = {
          businessName,
          website,
          facebook,
          phone,
          address,
          category: input.category || "unknown",
          area: input.area || "unknown",
          source: "search-api",
          sourceUrl: ddgUrl,
          evidenceUrls: [ddgUrl, cleanUrl || ""].filter(Boolean),
          notes: `Snippet: "${snippetText.slice(0, 100)}..."`
        };

        yield lead;
        count++;
      }
    } catch (error: any) {
      logger.error(`Error in DuckDuckGo Search Source: ${error.message}`);
    }
  }
}
