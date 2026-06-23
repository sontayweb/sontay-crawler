import { Command } from "commander";
import { runScrapePipeline, runScorePipeline } from "./index.js";
import { logger } from "./logger.js";
import dotenv from "dotenv";

dotenv.config();

const program = new Command();

program
  .name("sontay-crawler")
  .description("Son Tay local business lead scraper and scoring utility")
  .version("1.0.0");

program
  .command("scrape")
  .description("Scrape local business leads based on keywords, category, and area")
  .option("-q, --query <string>", "Search query keyword")
  .option("-a, --area <string>", "Priority target area (e.g. son-tay, ba-vi)")
  .option("-c, --category <string>", "Business category (e.g. spa, cafe)")
  .option("-l, --limit <number>", "Max number of leads to collect", (v) => parseInt(v, 10))
  .option("-o, --out <string>", "Output path for the exported CSV file")
  .option("-d, --dry-run", "Run scrape adapter but do not save or write to files", false)
  .option("-s, --source <string>", "Filter run by specific source adapter name")
  .option("--config <string>", "Path to source configuration JSON file")
  .option("-r, --resume", "Resume crawl by loading and merging existing processed database", false)
  .action(async (options) => {
    try {
      await runScrapePipeline(options);
    } catch (err: any) {
      logger.error(`Scrape command execution failed: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command("score")
  .description("Recalculate scoring and export local database leads")
  .requiredOption("-i, --input <string>", "Input JSONL file of leads to process")
  .requiredOption("-o, --out <string>", "Output file path (CSV or JSONL)")
  .action((options) => {
    try {
      runScorePipeline(options.input, options.out);
    } catch (err: any) {
      logger.error(`Score command execution failed: ${err.message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
