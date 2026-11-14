import { expect, test, type Page } from "@playwright/test";

// The fake console-api (fake-console-api.mts) serves testdata/usage.json for a window console-api would take and
// echoes that window, which the summary shows as its Date range. Each case runs at a desktop and a phone width.
const DAY_MS = 86_400_000;
const signIn = (page: Page, baseURL: string | undefined) =>
  page.context().addCookies(["vws_session", "vws_csrf"].map((name) => ({ name, value: "alice", url: baseURL })));
const range = (page: Page) => page.getByRole("button", { name: /^Date range/ });
/** The window console-api answered for. */
const answered = (page: Page) => page.locator("dt", { hasText: "Date range" }).locator("xpath=following-sibling::dd");

for (const width of [1440, 390]) {
  test.describe(`Billing and Cost Management home at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("shows usage by Region, with a dash for the region that has no data", async ({ page, baseURL }) => {
      await signIn(page, baseURL);
      await page.goto("/billing");
      await expect(page.getByRole("heading", { level: 1, name: "Billing and Cost Management home" })).toBeVisible();
      await expect(page.getByRole("row", { name: "pve-lab-1 6 8 120" })).toBeVisible();
      await expect(page.getByRole("row", { name: "pve-lab-2 2.5 1.5 40.25" })).toBeVisible();
      await expect(page.getByRole("row", { name: "pve-down-1 — — —" })).toBeVisible();
      await expect(page.getByRole("alert").filter({ hasText: "No data for pve-down-1." })).toBeVisible();
    });

    test("a chosen range reaches console-api and stays in the URL over a reload", async ({ page, baseURL }) => {
      await signIn(page, baseURL);
      await page.goto("/billing?region=pve-lab-1");
      await range(page).click();
      await page.getByRole("menuitem", { name: "Custom" }).click();
      await page.getByLabel("From").fill("2026-09-01");
      await page.getByLabel("To", { exact: true }).fill("2026-09-30");
      await page.getByRole("button", { name: "Apply" }).click();
      await expect(page).toHaveURL(/\/billing\?region=pve-lab-1&from=2026-09-01&to=2026-10-01$/);
      await expect(answered(page)).toHaveText("2026-09-01 — 2026-09-30");
      await page.reload();
      await expect(range(page)).toContainText("2026-09-01 — 2026-09-30");
      await expect(answered(page)).toHaveText("2026-09-01 — 2026-09-30");
      await range(page).click();
      await page.getByRole("menuitem", { name: "Last 7 Days" }).click();
      // The custom range matches the same pattern, so wait for it to leave the URL before reading the new one.
      await expect(page).not.toHaveURL(/from=2026-09-01/);
      await expect(page).toHaveURL(/region=pve-lab-1&from=\d{4}-\d\d-\d\d&to=\d{4}-\d\d-\d\d$/);
      const query = new URL(page.url()).searchParams;
      const [first, end] = [Date.parse(query.get("from") ?? ""), Date.parse(query.get("to") ?? "")];
      expect((end - first) / DAY_MS).toBe(7);
      const last = new Date(end - DAY_MS).toISOString().slice(0, 10);
      await expect(answered(page)).toHaveText(`${query.get("from")} — ${last}`);
    });
  });
}
