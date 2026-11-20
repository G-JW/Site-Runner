import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { program } = require("playwright/lib/program") as {
  program: { parseAsync(args: string[]): Promise<void> };
};
void program
  .parseAsync(["node", "playwright", "install", "--no-shell", "chromium"])
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
