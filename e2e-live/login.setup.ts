import { expect, test as setup } from "@playwright/test";

setup("signs in as the account root and keeps the session for the other specs", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Account ID").fill("123456789012");
  await page.getByLabel("User name").fill("root");
  await page.getByLabel("Password").fill(process.env.E2E_ROOT_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/compute\/instances/);
  await page.context().storageState({ path: "e2e-live/.auth/root.json" });
});
