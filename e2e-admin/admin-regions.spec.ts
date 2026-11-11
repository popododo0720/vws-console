import { expect, test, type Page } from "@playwright/test";

// The console keeps a session in two cookies of its own and forwards it to console-api (fake-console-api.mts).
async function openServices(page: Page, baseURL: string | undefined, user: string) {
  await page.context().addCookies(["vws_session", "vws_csrf"].map((name) => ({ name, value: user, url: baseURL })));
  await page.goto("/compute/instances");
  await page.getByRole("button", { name: "Services" }).click();
  await expect(page.getByRole("menuitem", { name: "Instances", exact: true })).toBeVisible();
}

test("no admin permissions: no Regions menu item, and a direct URL is denied", async ({ page, baseURL }) => {
  await openServices(page, baseURL, "alice");
  await expect(page.getByRole("menuitem", { name: "Regions" })).toHaveCount(0);
  for (const url of ["/admin/regions", "/admin/regions/pve-lab-1"]) {
    await page.goto(url);
    const alert = page.getByRole("alert").filter({ hasText: "Access denied" });
    await expect(alert).toContainText("You don't have permission to vws:AdminListRegions.");
    await expect(alert).toContainText("PermissionDenied · Request ID req-e2e-denied");
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Regions" })).toHaveCount(0);
  }
});

test("an administrator opens Regions from the Services menu", async ({ page, baseURL }) => {
  await openServices(page, baseURL, "root");
  await page.getByRole("menuitem", { name: "Regions" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Regions (0)" })).toBeVisible();
  await expect(page.getByText("No regions found")).toBeVisible();
  await expect(page.getByText("Access denied")).toHaveCount(0);
});
