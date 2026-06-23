import { BusinessLead } from "../schemas/lead.schema.js";
import { LeadSourceAdapter, SourceConfig, SourceRunInput } from "./source.types.js";
import { logger } from "../logger.js";
import { chromium } from "playwright";
import { normalizePhone } from "../utils/phone.js";
import { cleanLeadWithGemini } from "../utils/gemini.js";
import fs from "fs";
import path from "path";

/**
 * Standardize Facebook URL by stripping tracking parameters.
 */
function cleanFbUrl(url: string): string {
  if (!url) return "";
  try {
    const clean = url.split("?")[0].split("&")[0];
    return clean.trim();
  } catch {
    return url.trim();
  }
}

/**
 * Concurrency limiter to run async tasks in parallel with a pool of workers.
 */
async function limitConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIdx = index++;
      try {
        results[currentIdx] = await fn(items[currentIdx]);
      } catch (err) {
        // Ignore error
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// List of keywords indicating a business owner page
export const businessKeywords = [
  "spa", "beauty", "salon", "thẩm mỹ", "tham my", "massage", "clinic", "mi", "móng", "nail", "tóc", "hair", "phun xăm", "dưỡng sinh", "triệt lông",
  "cafe", "cà phê", "trà sữa", "nước ép", "nha hang", "nhà hàng", "quán ăn", "quan an", "lẩu", "nướng", "ẩm thực", "ăn vặt",
  "gara", "ô tô", "xe máy", "sửa xe", "vỏ xe", "lốp", "phụ tùng",
  "nha khoa", "răng", "phòng khám", "phong kham", "bác sĩ", "dược", "thuốc", "y tế",
  "homestay", "nhà nghỉ", "nha nghi", "khách sạn", "hotel", "resort",
  "studio", "chụp ảnh", "chup anh", "wedding", "áo cưới", "ao cuoi", "make up", "trang điểm",
  "tiệm vàng", "tiem vang", "trang sức", "nha thuoc", "nhà thuốc"
];

/**
 * Checks if a string contains any of the business keywords.
 */
export function containsBusinessKeyword(str: string): boolean {
  const lower = str.toLowerCase();
  return businessKeywords.some(kw => lower.includes(kw));
}

/**
 * Processes a raw Facebook element (profile or post) and returns a BusinessLead if valid, or null.
 */
export function processFacebookElement(
  item: { author: string; text: string; link: string; type: string },
  category: string,
  area: string
): Partial<BusinessLead> | null {
  // Extract phone number if present
  const phoneRegex = /(?:\+84|0)[35789][0-9]{8}/g;
  const matches = item.text.match(phoneRegex);
  const phone = matches && matches.length > 0 ? normalizePhone(matches[0]) : undefined;

  // Filter rules
  const isProfileMatch = item.type === "profile" && (containsBusinessKeyword(item.author) || containsBusinessKeyword(item.text));
  const isPostMatch = item.type === "post" && (phone || containsBusinessKeyword(item.author) || containsBusinessKeyword(item.text));

  if (phone || isProfileMatch || isPostMatch) {
    return {
      businessName: item.author.trim(),
      phone: phone || undefined,
      notes: `FB ${item.type} [${category}]: "${item.text.replace(/\s+/g, " ").slice(0, 150)}..."`,
      category,
      area: area || "son-tay",
      source: "public-directory",
      sourceUrl: item.link,
      evidenceUrls: [item.link],
      facebook: item.link.includes("facebook.com") ? item.link : undefined
    };
  }

  return null;
}

export class FacebookCdpSource implements LeadSourceAdapter {
  name = "facebook-cdp";

  canRun(config: SourceConfig): boolean {
    return config.name === this.name || config.type === this.name;
  }

  async *run(input: SourceRunInput): AsyncGenerator<Partial<BusinessLead>> {
    logger.info("Connecting to local Chrome debugging port 9222...");

    let browser;
    try {
      browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
    } catch (err: any) {
      logger.error(`Could not connect to Chrome on port 9222. Error details: ${err.message}`);
      logger.error("Please launch your Chrome in debug mode first by running:");
      logger.error("  chrome.exe --remote-debugging-port=9222");
      return;
    }

    const contexts = browser.contexts();
    let targetPage: any = null;

    for (const context of contexts) {
      const pages = context.pages();
      for (const page of pages) {
        try {
          const title = await page.title();
          const url = page.url();
          if (title.includes("Sơn Tây") || title.includes("Facebook") || url.includes("facebook.com")) {
            targetPage = page;
            logger.info(`Found active Facebook tab: "${title}" (${url})`);
            break;
          }
        } catch {
          // Ignore pages that can't be queried
        }
      }
      if (targetPage) break;
    }

    if (!targetPage) {
      logger.warn("No active Facebook or 'Sơn Tây' tab found in open Chrome windows.");
      await browser.close();
      return;
    }

    // 1. Detect Facebook Group ID from active tab URL
    const activeUrl = targetPage.url();
    const groupMatch = activeUrl.match(/facebook\.com\/groups\/([^/]+)/);
    if (!groupMatch) {
      logger.error("Active page is not a Facebook Group page.");
      logger.error("Please open your Facebook Group first, e.g.: https://www.facebook.com/groups/303274231518590");
      await browser.close();
      return;
    }
    const groupId = groupMatch[1];
    logger.info(`Detected Facebook Group ID: ${groupId}`);

    // Load existing database URLs for duplicate filtering
    const existingUrls = new Set<string>();
    try {
      const filePath = path.resolve("data/processed/leads.jsonl");
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        for (const line of lines) {
          if (line.trim()) {
            const lead = JSON.parse(line);
            if (lead.sourceUrl) {
              existingUrls.add(lead.sourceUrl);
              existingUrls.add(cleanFbUrl(lead.sourceUrl));
            }
            if (lead.facebook) {
              existingUrls.add(lead.facebook);
              existingUrls.add(cleanFbUrl(lead.facebook));
            }
          }
        }
        logger.info(`Loaded ${existingUrls.size} unique URLs from existing database.`);
      }
    } catch (err: any) {
      logger.warn(`Failed to read existing database for duplicate filtering: ${err.message}`);
    }

    const scrapeSummary: { keyword: string; status: string; newCount: number; dupCount: number }[] = [];

    // 2. Determine keywords to search
    const queryArg = input.query || "all";
    let searchKeywords: string[] = [];
    if (queryArg.toLowerCase() === "all" || queryArg.endsWith(".csv") || queryArg.endsWith(".json")) {
      searchKeywords = [
        "spa", 
        "salon toc", 
        "cafe", 
        "nha hang", 
        "quan an", 
        "gara oto", 
        "nha khoa", 
        "phong kham", 
        "homestay", 
        "studio chup anh", 
        "make up", 
        "tiem vang", 
        "nha thuoc"
      ];
    } else {
      searchKeywords = [queryArg];
    }

    let count = 0;

    let isFirstKeyword = true;
    for (const keyword of searchKeywords) {
      if (input.limit && count >= input.limit) break;

      // Add a random delay between 3s and 7s (except first query) to mimic human behavior
      if (!isFirstKeyword) {
        const delay = Math.floor(Math.random() * 4000) + 3000;
        logger.info(`Pausing for ${(delay / 1000).toFixed(1)}s to mimic human browsing behavior...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      isFirstKeyword = false;

      logger.info(`-----------------------------------------------------`);
      logger.info(`Starting continuous search for keyword: "${keyword}"`);
      const searchUrl = `https://www.facebook.com/groups/${groupId}/search/?q=${encodeURIComponent(keyword)}`;
      
      try {
        await targetPage.goto(searchUrl, { waitUntil: "domcontentloaded" });
        await new Promise((resolve) => setTimeout(resolve, 4000));
      } catch (err: any) {
        logger.error(`Failed to navigate to search URL for "${keyword}": ${err.message}`);
        continue;
      }

      // Continuous Scrolling: scroll up to 50 times, stopping if height/article counts stop changing or end-of-results is reached
      logger.info(`Scrolling down page continuously (max 50 times) to load posts...`);
      let lastHeight = 0;
      let lastPostsCount = 0;
      let noChangeCount = 0;
      let skippedDueToDuplicates = false;
      let totalDuplicatesDetected = 0;

      for (let i = 1; i <= 50; i++) {
        try {
          // 1. Scroll to the bottom of the page
          await targetPage.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });

          // 2. Wait for content to load and render
          await new Promise((resolve) => setTimeout(resolve, 1500));

          // 3. Detect end-of-results indicator (checking specific leaf elements to be fast and accurate)
          const hasReachedEnd = await targetPage.evaluate(() => {
            const endTexts = ["đã hết kết quả", "end of results", "không còn kết quả", "no more results"];
            const elements = Array.from(document.querySelectorAll("span, div"));
            return elements.some(el => {
              if (el.children.length > 0) return false; // Match leaf nodes only to prevent parent container matches
              const txt = (el.textContent || "").trim().toLowerCase();
              return endTexts.includes(txt);
            });
          });

          if (hasReachedEnd) {
            logger.info(`Detected end of results indicator. Stopping scroll.`);
            break;
          }

          // 4. Quick duplicate rate check to skip scrolling early if feed is already scraped
          const visibleLinks = await targetPage.evaluate(() => {
            const links: string[] = [];
            // Extract profile links
            const divs = Array.from(document.querySelectorAll("div"));
            divs.forEach((div: any) => {
              const text = div.innerText || "";
              const hasButton = text.includes("Thêm bạn bè") || text.includes("Xem trang cá nhân") || text.includes("Nhắn tin");
              if (hasButton && div.offsetHeight > 40 && div.offsetHeight < 300) {
                const a = div.querySelector('a[role="link"]');
                if (a && a.href) links.push(a.href);
              }
            });
            // Extract post links
            const postLinks = Array.from(document.querySelectorAll('span a[role="link"]'))
              .map((a: any) => a.href)
              .filter(href => href && href.includes("facebook.com"));
            links.push(...postLinks);
            return links;
          });

          if (visibleLinks.length >= 5) {
            let dupCount = 0;
            for (const link of visibleLinks) {
              const cleanLink = cleanFbUrl(link);
              if (existingUrls.has(link) || existingUrls.has(cleanLink)) {
                dupCount++;
              }
            }
            totalDuplicatesDetected = dupCount;
            const dupRate = dupCount / visibleLinks.length;
            if (dupRate >= 0.7) {
              logger.warn(`Detected high duplicate rate (${(dupRate * 100).toFixed(0)}%) in visible results. Skipping keyword "${keyword}" to save time.`);
              skippedDueToDuplicates = true;
              break;
            }
          }

          // 5. Fallback check: verify if the height or post count has changed (handles virtualized rendering)
          const currentHeight = await targetPage.evaluate(() => document.body.scrollHeight);
          const currentPostsCount = await targetPage.evaluate(() => {
            return document.querySelectorAll('div[role="feed"] div[role="article"], div[role="article"]').length;
          });

          if (currentHeight === lastHeight && currentPostsCount === lastPostsCount) {
            noChangeCount++;
            if (noChangeCount >= 3) {
              logger.info(`No height change and no new posts for 3 iterations. Reached end of search results.`);
              break;
            }
          } else {
            noChangeCount = 0;
            lastHeight = currentHeight;
            lastPostsCount = currentPostsCount;
          }
        } catch {
          break;
        }
      }

      if (skippedDueToDuplicates) {
        scrapeSummary.push({
          keyword,
          status: "Skipped (High Dups)",
          newCount: 0,
          dupCount: totalDuplicatesDetected
        });
        continue;
      }

      logger.info(`Extracting profile cards and post content for "${keyword}"...`);
      const elements = (await targetPage.evaluate(() => {
        const results: { author: string; text: string; link: string; type: string }[] = [];

        // Expand all "Xem thêm" (See more) buttons to get full text content
        const seeMoreElms = Array.from(document.querySelectorAll('span, div[role="button"]'));
        seeMoreElms.forEach((elm: any) => {
          const txt = (elm.innerText || "").trim();
          if (txt === "Xem thêm" || txt === "Xem thêm..." || txt === "See more") {
            try {
              elm.click();
            } catch (e) {
              // Ignore click errors
            }
          }
        });

        // 1. Scan Profile Cards
        const divs = Array.from(document.querySelectorAll("div"));
        divs.forEach((div: any) => {
          const text = div.innerText || "";
          const hasButton = text.includes("Thêm bạn bè") || text.includes("Xem trang cá nhân") || text.includes("Nhắn tin");
          
          if (hasButton && div.offsetHeight > 40 && div.offsetHeight < 300) {
            const links = Array.from(div.querySelectorAll('a[role="link"], span[role="link"]'));
            
            // Filter nameLink to avoid selecting buttons/meta links like "Thêm bạn bè"
            const nameLink = links.find((l: any) => {
              const txt = (l.innerText || "").trim();
              const lower = txt.toLowerCase();
              return txt.length > 1 && 
                     !lower.includes("thêm bạn bè") && 
                     !lower.includes("xem trang cá nhân") && 
                     !lower.includes("nhắn tin") && 
                     !lower.includes("thêm") && 
                     !lower.includes("bạn bè") &&
                     !lower.includes("xem") &&
                     !lower.includes("tin");
            });

            const name = nameLink ? (nameLink as any).innerText.trim() : "";
            
            const cleanText = text
              .replace("Thêm bạn bè", "")
              .replace("Xem trang cá nhân", "")
              .replace("Nhắn tin", "")
              .replace(/\s+/g, " ")
              .trim();

            let href = nameLink ? (nameLink as any).href || (nameLink as any).getAttribute("href") : "";
            if (href && !href.startsWith("http")) {
              href = "https://www.facebook.com" + (href.startsWith("/") ? "" : "/") + href;
            }
            if (!href) href = window.location.href;

            if (name && name.length < 100 && !results.some(r => r.author === name)) {
              results.push({
                author: name,
                text: cleanText,
                link: href,
                type: "profile"
              });
            }
          }
        });

        // 2. Scan Posts
        const posts = Array.from(
          document.querySelectorAll(
            'div[role="feed"] div[role="article"], div[data-ad-comet-preview="message"], div[role="article"]'
          )
        );
        posts.forEach((post: any) => {
          // Extract message text preferentially
          const messageEl = post.querySelector('div[data-ad-comet-preview="message"]');
          let textContent = messageEl ? messageEl.innerText : (post.innerText || "");

          // Incorporate automatic image descriptions/alt text provided by Facebook AI
          const imgs = Array.from(post.querySelectorAll('img'));
          const imageAlts = imgs
            .map((img: any) => (img.alt || "").trim())
            .filter((alt: string) => alt.length > 5 && !alt.toLowerCase().includes("avatar") && !alt.toLowerCase().includes("profile picture"));
          if (imageAlts.length > 0) {
            textContent += "\n[Hình ảnh chứa: " + imageAlts.join(", ") + "]";
          }

          // Target author link from heading element preferentially
          const heading = post.querySelector("h3, h2");
          let authorEl = heading ? heading.querySelector('a[role="link"], strong a, a') : null;
          if (!authorEl) {
            authorEl = post.querySelector('h3 strong a, h2 a, a[role="link"], strong a');
          }
          let author = authorEl && authorEl.innerText.trim() ? authorEl.innerText.trim() : "Thành viên Facebook";
          if (author.startsWith("#") || author.length < 2) {
            author = "Thành viên Facebook";
          }
          
          const linkEl = post.querySelector('span a[role="link"]');
          let link = linkEl ? linkEl.href || linkEl.getAttribute("href") : "";
          if (link && !link.startsWith("http")) {
            link = "https://www.facebook.com" + (link.startsWith("/") ? "" : "/") + link;
          }
          if (!link) link = window.location.href;

          if (textContent.trim() && !results.some(r => r.text === textContent)) {
            results.push({
              author,
              text: textContent,
              link,
              type: "post"
            });
          }

          // Extract visible comments under this post
          const commentElms = Array.from(post.querySelectorAll('div[role="comment"]'));
          commentElms.forEach((cmt: any) => {
            const rawCommentText = cmt.innerText || "";
            const cmtAuthorEl = cmt.querySelector('a[role="link"], span[role="link"]');
            const cmtAuthor = cmtAuthorEl ? cmtAuthorEl.innerText.trim() : "Người dùng Facebook";
            
            // Clean the comment text
            let cleanText = rawCommentText.replace(cmtAuthor, "");
            cleanText = cleanText
              .replace(/\bThích\b/gi, "")
              .replace(/\bPhản hồi\b/gi, "")
              .replace(/\bChia sẻ\b/gi, "")
              .replace(/\bXem phản hồi\b/gi, "")
              .replace(/\bXem thêm phản hồi\b/gi, "")
              .replace(/\s+/g, " ")
              .trim();

            if (cleanText.length > 10 && !results.some(r => r.text === cleanText)) {
              const t = cleanText.toLowerCase();
              const hasPhone = /\b(0\d{9,10})\b/.test(t) || /sđt|sdt|đt|dt|phone|liên hệ|lh/i.test(t);
              const hasLocation = /ở|tại|địa chỉ|đc|dc|phố|đường/i.test(t);
              const hasRecommend = /qua|ghé|tiệm|quán|cửa hàng|chỗ|bên/i.test(t);
              
              if (hasPhone || (hasLocation && hasRecommend)) {
                results.push({
                  author: cmtAuthor,
                  text: `[Bình luận gợi ý] ${cleanText}`,
                  link: link,
                  type: "comment"
                });
              }
            }
          });
        });

        return results;
      })) as { author: string; text: string; link: string; type: string }[];

      logger.info(`Found ${elements.length} raw profile/post candidates to analyze for "${keyword}".`);

      // Filter out duplicate profiles/posts in memory BEFORE calling Gemini to save API costs
      const newElements: typeof elements = [];
      let duplicateElementsCount = 0;
      for (const item of elements) {
        const cleanLink = cleanFbUrl(item.link);
        if (existingUrls.has(item.link) || existingUrls.has(cleanLink)) {
          duplicateElementsCount++;
        } else {
          newElements.push(item);
        }
      }

      if (newElements.length === 0) {
        logger.info(`All ${elements.length} candidates for "${keyword}" are already in the database. Skipping Gemini processing.`);
        scrapeSummary.push({
          keyword,
          status: "Completed (No New)",
          newCount: 0,
          dupCount: duplicateElementsCount
        });
        continue;
      }

      logger.info(`Analyzing ${newElements.length} new candidates concurrently with Gemini (Skipping ${duplicateElementsCount} duplicate elements)...`);

      // Process only new candidates concurrently with a concurrency limit of 5 workers
      const CONCURRENCY_LIMIT = 5;
      const processedLeads = await limitConcurrency(newElements, CONCURRENCY_LIMIT, async (item) => {
        let lead: Partial<BusinessLead> | null = null;
        
        // Try using Gemini if API key is provided
        if (process.env.GEMINI_API_KEY) {
          logger.info(`[Gemini Concurrent] Analyzing: "${item.author}"...`);
          const geminiResult = await cleanLeadWithGemini(item.text, item.author, keyword, input.area || "son-tay");
          if (geminiResult) {
            if (geminiResult.isBusinessLead) {
              lead = {
                businessName: geminiResult.businessName || item.author,
                phone: geminiResult.phone || undefined,
                address: geminiResult.address || undefined,
                website: geminiResult.website || undefined,
                notes: `[Gemini Filtered] ${geminiResult.notes}`,
                category: geminiResult.category || keyword,
                area: input.area || "son-tay",
                source: "public-directory",
                sourceUrl: item.link,
                evidenceUrls: [item.link],
                facebook: item.link.includes("facebook.com") ? item.link : undefined
              };
            } else {
              logger.info(`[Gemini Concurrent] Skipped non-business: "${item.author}"`);
            }
          }
        }

        // Fallback to local regex/keyword parser if Gemini is disabled or failed
        if (!lead) {
          lead = processFacebookElement(item, keyword, input.area || "son-tay");
        }

        return lead;
      });

      let addedCount = 0;
      for (const lead of processedLeads) {
        if (lead) {
          yield lead;
          count++;
          addedCount++;
        }
      }

      scrapeSummary.push({
        keyword,
        status: "Completed",
        newCount: addedCount,
        dupCount: duplicateElementsCount + (newElements.length - addedCount)
      });
    }

    // Close CDP session
    await browser.close();

    // Print a gorgeous scraping summary table
    logger.info("\n=======================================================");
    logger.info("               FACEBOOK CRAWLER REPORT                 ");
    logger.info("=======================================================");
    console.log(
      String("Keyword").padEnd(18) + " | " + 
      String("Status").padEnd(18) + " | " + 
      String("New Leads").padEnd(10) + " | " + 
      String("Duplicates")
    );
    console.log("-".repeat(60));
    for (const row of scrapeSummary) {
      console.log(
        row.keyword.padEnd(18) + " | " + 
        row.status.padEnd(18) + " | " + 
        String(row.newCount).padEnd(10) + " | " + 
        row.dupCount
      );
    }
    console.log("=======================================================\n");

    logger.success(`Scan completed successfully. Collected ${count} leads across categories.`);
  }
}
