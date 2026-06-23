import { PlaywrightCrawler } from "crawlee";
import { BusinessLead } from "../schemas/lead.schema.js";
import { LeadSourceAdapter, SourceConfig, SourceRunInput } from "./source.types.js";
import { logger } from "../logger.js";

export class PublicDirectorySource implements LeadSourceAdapter {
  name = "public-directory";

  canRun(config: SourceConfig): boolean {
    return config.name === this.name || config.type === "public-directory";
  }

  async *run(input: SourceRunInput): AsyncGenerator<Partial<BusinessLead>> {
    logger.info("Initializing public directory crawler (Playwright)...");
    
    const sourceConfig = input.config || {};
    let seeds = sourceConfig.seeds || [];
    
    // Fallback: If no seeds are defined but query/category/area are provided, build Trang Vang search URL
    if (seeds.length === 0) {
      const query = input.query || `${input.category || ""} ${input.area || ""}`.trim();
      if (query) {
        seeds = [`https://www.trangvangvietnam.com/search.asp?key=${encodeURIComponent(query)}`];
      }
    }

    const selectors = sourceConfig.selectors || {
      item: ".box_doanhnghiep, .box_listing, .listing_box",
      name: "h2.name_dn a, .title_listing, a.name_dn, h2 a",
      phone: ".phone_dn, .phone_listing, span.phone, .phone",
      address: ".address_dn, .address_listing, span.address, .address",
      website: ".website_dn a, .website_listing, a.website, .website"
    };

    if (seeds.length === 0) {
      logger.warn("Public directory source: No seed URLs or search query provided.");
      return;
    }

    const leadsCollected: Partial<BusinessLead>[] = [];

    // Instantiate PlaywrightCrawler to bypass Cloudflare/JS challenge blocking
    const crawler = new PlaywrightCrawler({
      maxRequestsPerCrawl: input.limit ? input.limit * 2 : 20,
      requestHandlerTimeoutSecs: 45,
      launchContext: {
        launchOptions: {
          headless: true
        }
      },
      
      async requestHandler({ page, request }) {
        logger.info(`Crawling public directory page: ${request.url}`);
        
        try {
          // Wait for the selector to ensure the page has loaded
          await page.waitForSelector("body", { timeout: 15000 });
          const title = await page.title();
          logger.info(`Page title: "${title.trim()}"`);

          // Evaluate in page context to extract data
          const parsed = await page.$$eval(
            selectors.item,
            (elements, sel) => {
              return elements.map((el) => {
                const nameEl = el.querySelector(sel.name);
                const phoneEl = el.querySelector(sel.phone);
                const addrEl = el.querySelector(sel.address);
                const webEl = el.querySelector(sel.website);

                // Helper to get website url
                let websiteHref = "";
                if (webEl) {
                  websiteHref = webEl.getAttribute("href") || "";
                  if (websiteHref.startsWith("redirect.asp?link=")) {
                    const params = new URLSearchParams(websiteHref.split("?")[1] || "");
                    const link = params.get("link");
                    if (link) websiteHref = link;
                  }
                }

                return {
                  name: nameEl ? nameEl.textContent?.trim() || "" : "",
                  phone: phoneEl ? phoneEl.textContent?.trim() || "" : "",
                  address: addrEl ? addrEl.textContent?.trim() || "" : "",
                  website: websiteHref || (webEl ? webEl.textContent?.trim() || "" : "")
                };
              });
            },
            selectors
          );

          logger.info(`Found ${parsed.length} candidate elements on page.`);

          for (const item of parsed) {
            if (item.name) {
              leadsCollected.push({
                businessName: item.name,
                phone: item.phone || undefined,
                address: item.address || undefined,
                website: item.website || undefined,
                category: input.category || "unknown",
                area: input.area || "unknown",
                source: "public-directory",
                sourceUrl: request.url,
                evidenceUrls: [request.url],
                notes: `Extracted via Playwright directory crawler from: ${request.url}`
              });
            }
          }
        } catch (err: any) {
          logger.warn(`Failed extracting directory data from page: ${err.message}`);
        }
      }
    });

    try {
      await crawler.run(seeds);
    } catch (err: any) {
      logger.error(`Error during Playwright directory crawler run: ${err.message}`);
    }

    logger.success(`Public directory crawling finished. Found ${leadsCollected.length} candidate leads.`);

    let count = 0;
    for (const lead of leadsCollected) {
      if (input.limit && count >= input.limit) break;
      yield lead;
      count++;
    }
  }
}
