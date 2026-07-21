/**
 * Lazy-chunk smoke tests
 *
 * All pages except Dashboard are loaded via React.lazy() behind a Suspense
 * boundary. A mis-typed import path silently shows a permanent spinner
 * instead of content. These tests verify that every lazy-loaded chunk
 * actually renders real page content (not just the spinner fallback).
 *
 * Test organisation:
 *   1. Login form test — validates the browser-based login UI works end-to-end
 *   2. Lazy route tests — direct URL navigation confirming each chunk loads
 *   3. Target Detail tabs — all 13 tabs confirmed to render content
 *   4. Navigation flow tests — UI transition paths (nav click → Pipeline,
 *      deal card click → Target Detail, tab click → Target Detail sections)
 *
 * Auth strategy for the main suite:
 *   globalSetup (global-setup.ts) fetches one JWT before any test runs and
 *   writes it to .auth/token.txt, avoiding repeated login API calls that
 *   would trigger the rate-limiter (30 req / 15 min per IP).
 *   Each test injects the cached token into localStorage via page.evaluate
 *   before navigating — no additional login API calls needed.
 *
 * Credentials: seeded admin account whose default password is set by the
 * startup migration in artifacts/api-server/src/index.ts.
 */

import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";

// ── Constants ──────────────────────────────────────────────────────────────

const AUTH_TOKEN_KEY = "ig_os_auth_token";
const TOKEN_FILE = path.join(__dirname, "..", ".auth", "token.txt");
const SAMPLE_TARGET_ID = 4; // TGT-004, seeded in the development database
// Credentials from env vars; fall back to dev seed values only in non-production
const EMAIL    = process.env.TEST_EMAIL    ?? "rahul.sharma@manipalgroup.info";
const PASSWORD = process.env.TEST_PASSWORD ?? "Ringside@123";

// The spinner emitted by PageLoader while a lazy chunk resolves.
const SPINNER = ".animate-spin";

// ── Auth helpers ───────────────────────────────────────────────────────────

/**
 * Read the pre-fetched JWT from disk (written by globalSetup) and inject it
 * into the browser's localStorage on the app origin, then navigate to the
 * requested path so the React app boots already authenticated.
 */
async function authenticateAndNavigate(
  page: Page,
  targetPath: string = "/"
): Promise<void> {
  const token = fs.readFileSync(TOKEN_FILE, "utf-8").trim();
  await page.goto("/");
  await page.evaluate(
    ([key, val]) => localStorage.setItem(key, val),
    [AUTH_TOKEN_KEY, token]
  );
  if (targetPath === "/") {
    await page.reload();
  } else {
    await page.goto(targetPath);
  }
}

// ── Content helpers ────────────────────────────────────────────────────────

/**
 * Assert the page has rendered real content and is NOT stuck on the spinner.
 * Waits up to 10 s for the suspense fallback to detach, then asserts the
 * document has meaningful text content.
 */
async function assertPageLoaded(page: Page, label: string): Promise<void> {
  // Spinner disappearing is a good signal but optional — the chunk may have
  // already resolved before the spinner had a chance to mount.
  await page
    .locator(SPINNER)
    .waitFor({ state: "detached", timeout: 10_000 })
    .catch(() => {
      // Spinner may never appear (chunk already cached) — that is fine
    });

  // Structural content MUST appear. Not catching here: a timeout here means
  // the page is genuinely stuck (broken lazy import, bad route, auth redirect).
  await page
    .locator("h1, h2, h3, button, [class*='card']")
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });

  const bodyText = await page.evaluate(() => document.body.innerText.trim());
  expect(
    bodyText.length,
    `${label}: page appears empty or stuck on spinner after lazy-load`
  ).toBeGreaterThan(10);
}

/**
 * Read the innerText of the currently visible tab panel.
 * Uses JavaScript to find the panel that is NOT hidden by CSS (display !== none),
 * which is more robust than CSS-attribute selectors like :not([hidden]) that
 * may not match Radix UI's hiding mechanism.
 */
async function activePanelText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const panels = document.querySelectorAll('[role="tabpanel"]');
    for (const p of panels) {
      const style = window.getComputedStyle(p);
      if (style.display !== "none" && style.visibility !== "hidden") {
        return (p as HTMLElement).innerText ?? "";
      }
    }
    return "";
  });
}

/**
 * Assert content is visible, scoped to the active tab panel only.
 * Prevents hidden sidebar nav text from satisfying the assertion.
 * Returns a locator rooted in the first non-hidden tab panel.
 */
function tabPanel(page: Page) {
  // data-state="active" is Radix UI's way to mark the active panel.
  // Fall back to :not([hidden]) for other implementations.
  return page.locator(
    '[role="tabpanel"][data-state="active"], [role="tabpanel"]:not([hidden])'
  ).first();
}

// ══════════════════════════════════════════════════════════════════════════
// 1. LOGIN FORM TEST
//    Validates the interactive browser-based login path end-to-end.
//    Uses the password login form directly (no token injection).
//    Note: the API's CORS policy allows http://localhost so the browser
//    fetch from Playwright's headless Chromium reaches the auth endpoint.
// ══════════════════════════════════════════════════════════════════════════

test.describe("Login form (interactive browser auth)", () => {
  test("Login form authenticates and navigates to Dashboard", async ({
    page,
  }) => {
    await page.goto("/");
    // Fresh context — login screen should be visible
    await expect(page.locator('input[type="email"]')).toBeVisible({
      timeout: 8_000,
    });

    // Fill credentials and submit
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');

    // Dashboard content must appear — login screen must be gone
    await expect(page.locator('input[type="password"]')).not.toBeVisible({
      timeout: 20_000,
    });

    await assertPageLoaded(page, "Dashboard after login");
    await expect(
      page.locator("h1, h2, h3, [class*='card'], [class*='kpi']").first()
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. LAZY ROUTE TESTS (direct URL navigation)
//    Covers routes that are loaded as separate JS chunks via React.lazy().
//    A mis-typed import path causes an infinite spinner — each test asserts
//    real content renders.
// ══════════════════════════════════════════════════════════════════════════

test.describe("Lazy-loaded page chunks render correctly", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAndNavigate(page, "/");
    await expect(page.locator('input[type="password"]')).not.toBeVisible({
      timeout: 15_000,
    });
  });

  test("Dashboard renders (eagerly loaded baseline)", async ({ page }) => {
    await assertPageLoaded(page, "Dashboard");
    await expect(page.locator("h1, h2, h3").first()).toBeVisible({
      timeout: 8_000,
    });
  });

  // The Pipeline page defaults to List view (localStorage persists choice;
  // the code falls back to "list" when no stored value exists).
  test("Pipeline page renders List view by default (lazy chunk)", async ({
    page,
  }) => {
    await page.goto("/pipeline");
    await assertPageLoaded(page, "Pipeline/List");
    // PipelineListTable renders an HTML table — assert it is present
    await expect(page.locator("table").first()).toBeVisible({ timeout: 8_000 });
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test("Pipeline Board (Kanban) view renders after toggle (lazy chunk)", async ({
    page,
  }) => {
    await page.goto("/pipeline");
    await assertPageLoaded(page, "Pipeline before board toggle");

    // Click the Board-view toggle — button has title="Board view" (icon-only)
    const boardBtn = page.locator('button[title="Board view"]');
    await expect(boardBtn).toBeVisible({ timeout: 8_000 });
    await boardBtn.click();

    // PipelineKanban renders stage-column headings via StageChip.
    // Stage names come from PIPELINE_STAGE_ORDER in stage-rail.tsx.
    await expect(
      page
        .getByText(/Sourcing|Outreach|Introductory Discussion|NDA.*CIM/i)
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Actions Command Center renders (lazy chunk)", async ({ page }) => {
    await page.goto("/actions");
    await assertPageLoaded(page, "/actions");
    await expect(
      page
        .locator('select, input[type="search"], [class*="filter"]')
        .or(page.getByText("Overdue"))
        .or(page.getByText("Due This Week"))
        .or(page.getByText("Upcoming"))
        .first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test("AI Copilot page renders (lazy chunk)", async ({ page }) => {
    await page.goto("/copilot");
    await assertPageLoaded(page, "/copilot");
    await expect(
      page.getByRole("heading", { name: /Ringside Copilot/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Weekly Review page renders (lazy chunk)", async ({ page }) => {
    await page.goto("/weekly-review");
    await assertPageLoaded(page, "/weekly-review");
    await expect(page.getByRole("heading").first()).toBeVisible({
      timeout: 8_000,
    });
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).toMatch(
      /Must-Win|Needs Attention|Overdue|Stage Changes|Weekly Review/i
    );
  });

  test("Diligence Review page renders (lazy chunk)", async ({ page }) => {
    await page.goto("/diligence-review");
    await assertPageLoaded(page, "/diligence-review");
    await expect(page.getByRole("heading").first()).toBeVisible({
      timeout: 8_000,
    });
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).toMatch(
      /Must-Win|Blocked|Overdue|Completion|Diligence/i
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. TARGET DETAIL TABS
//    All 13 tabs in Target Detail are lazy sub-components or sections.
//    Each test clicks the tab and asserts content renders inside the active
//    tab panel (scoped to prevent hidden sidebar nav from matching).
// ══════════════════════════════════════════════════════════════════════════

test.describe("Target Detail — all tabs render (lazy sub-components)", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAndNavigate(page, `/targets/${SAMPLE_TARGET_ID}`);
    // Wait for tab bar to confirm target detail has fully rendered
    await expect(page.locator('[role="tablist"]')).toBeVisible({
      timeout: 15_000,
    });
  });

  /**
   * Click a tab by its label and assert the resulting panel has real content.
   *
   * Strategy:
   * 1. Click the tab trigger.
   * 2. Wait for `aria-selected="true"` on the trigger — confirms React has
   *    processed `onValueChange` and the correct panel is now active.
   * 3. Wait for all Skeleton (`.animate-pulse`) elements to detach — signals
   *    that the async data fetch (e.g. ActivityTab's useGetActivityFeed) has
   *    completed and the panel has rendered either real data or an empty state.
   * 4. Read the visible panel's innerText via JS and assert non-empty.
   *
   * This avoids the race condition where `waitForFunction` catches the OLD
   * panel while it is still briefly visible (returns its text), then
   * `activePanelText` runs after the NEW panel has mounted but is still
   * showing loading skeletons (returns empty).
   */
  async function clickTabAndAssertContent(
    page: Page,
    tabLabel: RegExp | string,
    expectedPattern?: RegExp
  ) {
    const tabTrigger = page.getByRole("tab", { name: tabLabel });
    await tabTrigger.click();

    // Step 1: confirm the tab trigger is now selected (Radix fires onValueChange)
    await expect(tabTrigger).toHaveAttribute("aria-selected", "true", {
      timeout: 8_000,
    });

    // Step 2: wait for loading skeletons to clear (async data fetches)
    await page
      .locator(".animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 12_000 })
      .catch(() => {
        // Skeleton may never appear (data already cached) — that is fine
      });

    // Step 3: read and assert panel text
    const text = await activePanelText(page);
    expect(
      text.length,
      `Tab "${tabLabel}": active panel rendered empty content`
    ).toBeGreaterThan(0);

    if (expectedPattern) {
      expect(text, `Tab "${tabLabel}": expected pattern not found`).toMatch(
        expectedPattern
      );
    }
  }

  test("Overview tab renders", async ({ page }) => {
    await clickTabAndAssertContent(page, /overview/i);
  });

  test("Log (Interactions) tab renders", async ({ page }) => {
    await clickTabAndAssertContent(page, /^log$/i);
  });

  test("Actions tab renders", async ({ page }) => {
    await clickTabAndAssertContent(page, /^actions$/i);
  });

  test("Timeline (History) tab renders", async ({ page }) => {
    await clickTabAndAssertContent(page, /timeline/i);
  });

  test("Diligence tab renders", async ({ page }) => {
    await clickTabAndAssertContent(
      page,
      /diligence/i,
      /Commercial|Financial|readiness|Diligence/i
    );
  });

  test("Documents tab renders", async ({ page }) => {
    await clickTabAndAssertContent(page, /^documents$/i);
  });

  test("Valuation tab renders", async ({ page }) => {
    await clickTabAndAssertContent(page, /valuation/i);
  });

  test("Synergies tab renders", async ({ page }) => {
    await clickTabAndAssertContent(page, /synergies/i);
  });

  test("Activity tab renders", async ({ page }) => {
    await clickTabAndAssertContent(page, /activity/i);
  });

  test("IC tab renders", async ({ page }) => {
    await clickTabAndAssertContent(page, /^ic$/i);
  });

  test("Stakeholders tab renders", async ({ page }) => {
    await clickTabAndAssertContent(
      page,
      /stakeholders/i,
      /Counterparty|Sponsor|Advisor/i
    );
  });

  test("Compliance tab renders", async ({ page }) => {
    await clickTabAndAssertContent(
      page,
      /compliance/i,
      /NDA|Regulatory|Clearance/i
    );
  });

  test("Audit tab renders", async ({ page }) => {
    await clickTabAndAssertContent(page, /audit/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 4. NAVIGATION FLOW TESTS
//    Validates user-path transitions through UI interactions — not just
//    direct URL jumps — so regressions in in-app navigation are caught.
// ══════════════════════════════════════════════════════════════════════════

test.describe("Navigation flows (UI transitions)", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAndNavigate(page, "/");
    await expect(page.locator('input[type="password"]')).not.toBeVisible({
      timeout: 15_000,
    });
  });

  test("Dashboard → Pipeline via sidebar nav link", async ({ page }) => {
    // Confirm Dashboard rendered before navigating away
    await expect(page.locator("h1, h2, h3").first()).toBeVisible({
      timeout: 8_000,
    });
    // Nav text labels are hidden in collapsed-rail state; select by href instead
    const pipelineNavLink = page.locator('a[href="/pipeline"]').first();
    await expect(pipelineNavLink).toBeVisible({ timeout: 8_000 });
    await pipelineNavLink.click();
    // Wait for URL change AND Pipeline-specific UI (not satisfied by old Dashboard content)
    await expect(page).toHaveURL(/\/pipeline/, { timeout: 8_000 });
    await expect(
      page
        .locator('select, input[placeholder*="search" i], [class*="stage"], [class*="kanban"]')
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Dashboard → Actions via sidebar nav link", async ({ page }) => {
    // Confirm Dashboard rendered before navigating away
    await expect(page.locator("h1, h2, h3").first()).toBeVisible({
      timeout: 8_000,
    });
    // Nav text labels are hidden in collapsed-rail state; select by href instead
    const actionsNavLink = page.locator('a[href="/actions"]').first();
    await expect(actionsNavLink).toBeVisible({ timeout: 8_000 });
    await actionsNavLink.click();
    // Wait for URL change AND Actions-specific UI (not satisfied by old Dashboard content)
    await expect(page).toHaveURL(/\/actions/, { timeout: 8_000 });
    await expect(
      page
        .getByText("Overdue")
        .or(page.getByText("Due This Week"))
        .or(page.getByText("Upcoming"))
        .or(page.locator('[class*="filter"]'))
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Pipeline → Target Detail via deal card click", async ({ page }) => {
    await page.goto("/pipeline");
    await assertPageLoaded(page, "Pipeline before deal click");
    const dealLink = page.locator('a[href*="/targets/"]').first();
    if (await dealLink.isVisible().catch(() => false)) {
      await dealLink.click();
      await expect(page).toHaveURL(/\/targets\/\d+/, { timeout: 8_000 });
      await assertPageLoaded(page, "Target Detail after deal click");
      await expect(page.locator('[role="tablist"]')).toBeVisible({
        timeout: 8_000,
      });
    } else {
      test.skip(true, "No visible deal cards in pipeline to click");
    }
  });

  test("Target Detail → Actions tab via tab click", async ({ page }) => {
    await page.goto(`/targets/${SAMPLE_TARGET_ID}`);
    await expect(page.locator('[role="tablist"]')).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("tab", { name: /^actions$/i }).click();
    // Use JS evaluation to read visible panel text — avoids Radix attribute issues
    await page.waitForFunction(
      () => {
        const panels = document.querySelectorAll('[role="tabpanel"]');
        for (const p of panels) {
          const style = window.getComputedStyle(p);
          if (style.display !== "none" && style.visibility !== "hidden") {
            return ((p as HTMLElement).innerText?.trim().length ?? 0) > 0;
          }
        }
        return false;
      },
      { timeout: 10_000, polling: 250 }
    );
    const panelText = await page.evaluate(() => {
      const panels = document.querySelectorAll('[role="tabpanel"]');
      for (const p of panels) {
        const style = window.getComputedStyle(p);
        if (style.display !== "none" && style.visibility !== "hidden") {
          return (p as HTMLElement).innerText ?? "";
        }
      }
      return "";
    });
    expect(panelText.length).toBeGreaterThan(0);
  });
});
