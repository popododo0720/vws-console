import { expect, test, type Page } from "@playwright/test";

async function dialogButton(page: Page, name: string) {
  await page.getByRole("dialog").getByRole("button", { name }).click();
}

test("creates and deletes a VPC, subnet and volume through the fake console-api", async ({ page }) => {
  await page.goto("/network/vpcs");
  await expect(page.getByText("VPCs could not be loaded")).toHaveCount(0);
  await expect(page.getByText("Sample data")).toHaveCount(0);

  await page.getByRole("button", { name: "Create VPC" }).first().click();
  await page.getByRole("dialog").locator("input").fill("10.42.0.0/16");
  await dialogButton(page, "Create VPC");
  const vpcRow = page.getByRole("row").filter({ hasText: "10.42.0.0/16" });
  await expect(vpcRow).toHaveCount(1);
  const vpcId = (await vpcRow.getByText(/^vpc-/).first().textContent())!.trim();

  await page.goto("/network/subnets");
  await page.getByRole("button", { name: "Create subnet" }).first().click();
  await page.getByRole("dialog").locator("select").selectOption(vpcId);
  await page.getByRole("dialog").getByPlaceholder("10.0.1.0/24").fill("10.42.1.0/24");
  await dialogButton(page, "Create subnet");
  const subnetRow = page.getByRole("row").filter({ hasText: "10.42.1.0/24" });
  await expect(subnetRow).toContainText(vpcId);

  await page.goto("/storage/volumes");
  await page.getByRole("button", { name: "Create volume" }).first().click();
  await page.getByRole("dialog").locator('input[type="number"]').fill("13");
  await dialogButton(page, "Create volume");
  const volumeRow = page.getByRole("row").filter({ hasText: "13 GiB" });
  await expect(volumeRow).toHaveCount(1);
  await expect(volumeRow).toContainText("gp3");

  await page.reload();
  await expect(volumeRow).toHaveCount(1);
  await expect.poll(async () => (await volumeRow.textContent()) ?? "", { timeout: 15_000 }).toMatch(/Available/);
  await volumeRow.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Delete volume" }).click();
  await expect(volumeRow).toHaveCount(0);

  await page.goto("/network/subnets");
  await subnetRow.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Delete subnet" }).click();
  await expect(subnetRow).toHaveCount(0);

  await page.goto("/network/vpcs");
  await vpcRow.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(vpcRow).toHaveCount(0);
});

test("shows the API error code when a create is rejected", async ({ page }) => {
  await page.goto("/network/vpcs");
  await page.getByRole("button", { name: "Create VPC" }).first().click();
  await page.getByRole("dialog").locator("input").fill("not-a-cidr");
  await dialogButton(page, "Create VPC");
  const alert = page.getByRole("dialog").getByRole("alert");
  await expect(alert).toContainText("The VPC could not be created");
  await expect(alert).toContainText("Request ID");
});

test("shows the empty instance list from the API", async ({ page }) => {
  await page.goto("/compute/instances");
  await expect(page.getByText("No instances")).toBeVisible();
  await expect(page.getByText("Instances could not be loaded")).toHaveCount(0);
});
