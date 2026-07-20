import { defineConfig, devices } from "@playwright/test";
import * as path from "path";
import { execSync } from "child_process";

// Resolve the Nix-installed Chromium binary dynamically so the config is not
// tied to a specific Nix store hash that changes when Chromium is updated.
// Priority: env override → `which chromium` → empty (Playwright default).
function resolveChromiumPath(): string {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  try {
    return execSync("which chromium", { encoding: "utf-8" }).trim();
  } catch {
    // Let Playwright fall back to its own bundled browser if `which` fails
    return "";
  }
}

const CHROMIUM_PATH = resolveChromiumPath();

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  globalSetup: path.resolve(__dirname, "global-setup.ts"),
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:80",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: CHROMIUM_PATH,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      },
    },
  ],
});
