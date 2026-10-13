import { expect, test } from "@playwright/test";

test("installer wizard reaches the storage step and validates NFS", async ({ page }) => {
  await page.goto("/installer");
  await expect(page.getByText("Sample data")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Tunnel NIC").selectOption("enp1s0");
  await page.getByLabel("External NIC").selectOption("enp1s0");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Storage");
  await expect(page.getByLabel(/MinIO/)).toBeDisabled();
  await page.getByLabel("NFS", { exact: true }).check();
  await page.getByLabel(/NFS server/).fill("nas.example.internal");
  await page.getByLabel(/Export path/).fill("exports");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText(/must be absolute/)).toBeVisible();
  await page.getByLabel(/Export path/).fill("/exports/vws");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Elastic IPs");
  await page.screenshot({ path: "test-results/installer-eip.png" });
});
