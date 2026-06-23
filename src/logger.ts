export const logger = {
  info: (msg: string, ...args: any[]) => console.log(`[INFO] ${msg}`, ...args),
  success: (msg: string, ...args: any[]) => console.log(`\x1b[32m[SUCCESS] ${msg}\x1b[0m`, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(`\x1b[33m[WARN] ${msg}\x1b[0m`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`\x1b[31m[ERROR] ${msg}\x1b[0m`, ...args),
  debug: (msg: string, ...args: any[]) => {
    if (process.env.DEBUG === "true" || process.env.NODE_ENV === "development") {
      console.log(`\x1b[36m[DEBUG] ${msg}\x1b[0m`, ...args);
    }
  }
};
