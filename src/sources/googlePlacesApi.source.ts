import { BusinessLead } from "../schemas/lead.schema.js";
import { LeadSourceAdapter, SourceConfig, SourceRunInput } from "./source.types.js";
import { logger } from "../logger.js";

export class GooglePlacesApiSource implements LeadSourceAdapter {
  name = "google-places-api";

  canRun(config: SourceConfig): boolean {
    return config.name === this.name;
  }

  async *run(input: SourceRunInput): AsyncGenerator<Partial<BusinessLead>> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      logger.warn("Google Places API source skipped: GOOGLE_PLACES_API_KEY is not defined in environment.");
      return;
    }

    const query = input.query || `${input.category || ""} ${input.area || ""}`.trim();
    if (!query) {
      logger.warn("Google Places API requires query, category, or area parameter.");
      return;
    }

    logger.info(`Searching Google Places API for query: "${query}"`);

    try {
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
      const searchRes = await fetch(searchUrl);
      
      if (!searchRes.ok) {
        throw new Error(`Google Place Search HTTP error: ${searchRes.status}`);
      }

      const searchResult = (await searchRes.json()) as any;
      if (searchResult.status !== "OK" && searchResult.status !== "ZERO_RESULTS") {
        throw new Error(`Google Place Search API error: ${searchResult.status} - ${searchResult.error_message || ""}`);
      }

      const items = searchResult.results || [];
      let count = 0;

      for (const item of items) {
        if (input.limit && count >= input.limit) break;

        const placeId = item.place_id;
        let details: any = {};

        if (placeId) {
          try {
            const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_phone_number,website,opening_hours&key=${apiKey}`;
            const detailsRes = await fetch(detailsUrl);
            if (detailsRes.ok) {
              const detailsResult = (await detailsRes.json()) as any;
              if (detailsResult.status === "OK") {
                details = detailsResult.result || {};
              }
            }
          } catch (err: any) {
            logger.warn(`Could not fetch details for place ID ${placeId}: ${err.message}`);
          }
        }

        const lead: Partial<BusinessLead> = {
          businessName: item.name,
          address: item.formatted_address,
          rating: item.rating,
          reviewCount: item.user_ratings_total,
          phone: details.formatted_phone_number,
          website: details.website,
          category: input.category || "unknown",
          area: input.area || "unknown",
          source: "google-places-api",
          sourceUrl: `https://www.google.com/maps/place/?q=place_id:${placeId}`,
          evidenceUrls: [`https://www.google.com/maps/place/?q=place_id:${placeId}`],
          openingHoursText: details.opening_hours?.weekday_text?.join(" | "),
          notes: `Google Place ID: ${placeId}`
        };

        yield lead;
        count++;
      }
    } catch (error: any) {
      logger.error(`Error in Google Places API adapter: ${error.message}`);
    }
  }
}
