import { expect, test } from "@playwright/test";

test("route error screen renders code and request ID without the message", async ({ page }) => {
  await page.goto("/e2e/route-error");
  await expect(page.getByRole("heading", { name: "This page hit a problem" })).toBeVisible();
  await expect(page.getByText("Error code")).toBeVisible();
  await expect(page.getByText("Request ID")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("e2e fixture failure");
});
