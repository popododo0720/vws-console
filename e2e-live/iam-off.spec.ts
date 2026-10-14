import { expect, test } from "@playwright/test";

test("IAM off: pages open without sign-in and writes go through with the server-side token", async ({ page, context }) => {
  await page.goto("/network/vpcs");
  await expect(page).toHaveURL(/\/network\/vpcs$/);
  await expect(page.getByText("VPCs could not be loaded")).toHaveCount(0);

  await page.getByRole("button", { name: "Create VPC" }).first().click();
  await page.getByRole("dialog").getByLabel("IPv4 CIDR").fill("10.91.0.0/16");
  await page.getByRole("dialog").getByRole("button", { name: "Create VPC" }).click();
  await expect(page.getByRole("row").filter({ hasText: "10.91.0.0/16" })).toHaveCount(1);

  // The VPC really exists in console-api, created with the token (checked here with the same token).
  const listed = await fetch(`${process.env.E2E_API_URL}/api/v1/vpcs`, { headers: { authorization: "Bearer dev-token" } });
  expect(JSON.stringify(await listed.json())).toContain("10.91.0.0/16");

  expect((await context.cookies()).filter((c) => c.name.startsWith("vws_"))).toEqual([]);
  expect(await page.evaluate(() => document.cookie)).toBe("");
});

test("IAM off: /login is not used and the account menu has no Sign out", async ({ page }) => {
  await page.goto("/login?next=%2Fstorage%2Fvolumes");
  await expect(page).toHaveURL(/\/storage\/volumes$/);
  const menu = page.getByRole("button", { name: /root \(IAM off\)/ });
  await expect(menu).toContainText("123456789012");
  await menu.click();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toHaveCount(0);
});
