import { PlaywrightCrawler } from "crawlee";
import { BusinessLead } from "../schemas/lead.schema.js";
import { LeadSourceAdapter, SourceConfig, SourceRunInput } from "./source.types.js";
import { logger } from "../logger.js";

export class PublicWebsiteSource implements LeadSourceAdapter {
  name = "public-website";

  canRun(config: SourceConfig): boolean {
    return config.name === this.name || config.type === "public-website";
  }

  async *run(input: SourceRunInput): AsyncGenerator<Partial<BusinessLead>> {
    const targetUrl = input.query || input.config?.targetUrl;
    if (!targetUrl) {
      logger.warn("Public website source skipped: No targetUrl specified.");
      return;
    }

    logger.info(`Starting Playwright website crawler for: ${targetUrl}`);

    const emails = new Set<string>();
    const phones = new Set<string>();
    const facebookLinks = new Set<string>();

    const crawler = new PlaywrightCrawler({
      maxRequestsPerCrawl: 5, // Crawl up to 5 sub-pages
      requestHandlerTimeoutSecs: 15,
      // Launch browser in headless mode
      launchContext: {
        launchOptions: {
          headless: true
        }
      },
      
      async requestHandler({ page, request }) {
        logger.info(`Crawling subpage: ${request.url}`);
        
        try {
          const bodyText = await page.innerText("body");
          
          // Regex for extracting emails
          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          const foundEmails = bodyText.match(emailRegex);
          if (foundEmails) {
            foundEmails.forEach((e) => emails.add(e.toLowerCase()));
          }

          // Regex for Vietnamese phones (basic check: starts with 0 or +84, then 9-10 digits)
          const phoneRegex = /(?:\+84|0)[35789][0-9]{8}/g;
          const foundPhones = bodyText.match(phoneRegex);
          if (foundPhones) {
            foundPhones.forEach((p) => phones.add(p));
          }

          // Extract social media links
          const hrefs = await page.$$eval("a", (anchors) => 
            anchors.map((a) => a.getAttribute("href")).filter((href): href is string => !!href)
          );
          
          for (const href of hrefs) {
            if (href.includes("facebook.com/") && !href.includes("sharer") && !href.includes("plugins")) {
              facebookLinks.add(href);
            }
          }
        } catch (err: any) {
          logger.warn(`Failed parsing page content for ${request.url}: ${err.message}`);
        }
      }
    });

    try {
      await crawler.run([targetUrl]);
    } catch (err: any) {
      logger.error(`Playwright crawler failed for URL ${targetUrl}: ${err.message}`);
    }

    const businessName = input.config?.businessName || new URL(targetUrl).hostname;
    
    const lead: Partial<BusinessLead> = {
      businessName,
      website: targetUrl,
      phone: Array.from(phones)[0],
      email: Array.from(emails)[0],
      facebook: Array.from(facebookLinks)[0],
      category: input.category || "unknown",
      area: input.area || "unknown",
      source: "public-website",
      sourceUrl: targetUrl,
      evidenceUrls: [targetUrl],
      notes: `Crawled contacts: email=[${Array.from(emails).join(", ")}], phone=[${Array.from(phones).join(", ")}], facebook=[${Array.from(facebookLinks).join(", ")}]`
    };

    yield lead;
  }
}
