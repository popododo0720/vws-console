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

test("lists a seeded instance by its Name tag and stops it", async ({ page, request }) => {
  const api = `http://127.0.0.1:${Number(process.env.E2E_EC2_PORT ?? 48081) - 1}/api/v1`;
  const headers = (key: string) => ({ authorization: "Bearer dev-token", "idempotency-key": key });
  const vpc = await (await request.post(`${api}/vpcs`, { headers: headers("seed-vpc"), data: { cidrBlock: "10.77.0.0/16" } })).json();
  const vpcId = vpc.items[0].vpcId;
  await expect.poll(async () => (await (await request.get(`${api}/vpcs`, { headers: headers("x") })).json()).items.find((v: { vpcId: string }) => v.vpcId === vpcId).state).toBe("available");
  const subnet = await (await request.post(`${api}/subnets`, { headers: headers("seed-subnet"), data: { vpcId, cidrBlock: "10.77.1.0/24" } })).json();
  const run = await request.post(`${api}/instances`, {
    headers: headers("seed-run"),
    data: { imageId: "ami-0123456789abcdef0", instanceType: "vws.small", subnetId: subnet.items[0].subnetId, count: 1, tags: { Name: "e2e-web" } },
  });
  expect(run.status()).toBe(202);
  const instanceId = (await run.json()).items[0].instanceId;

  await page.goto("/compute/instances");
  const row = page.getByRole("row").filter({ hasText: instanceId });
  await expect(row).toContainText("e2e-web");
  await expect(row).toContainText("vws.small");
  await expect.poll(async () => { await page.reload(); return (await row.textContent()) ?? ""; }, { timeout: 30_000 }).toContain("Running");
  await row.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Instance state/ }).first().click();
  await page.getByRole("menuitem", { name: "Stop" }).click();
  await expect(row).toContainText("Stopped", { timeout: 60_000 });

  await page.goto(`/compute/instances/${instanceId}`);
  await expect(page.getByText(`${instanceId} (e2e-web)`).first()).toBeVisible();
  await expect(page.getByText(vpcId).first()).toBeVisible();
});

test("launches an instance from the launch screen", async ({ page, request }) => {
  const api = `http://127.0.0.1:${Number(process.env.E2E_EC2_PORT ?? 48081) - 1}/api/v1`;
  const headers = (key: string) => ({ authorization: "Bearer dev-token", "idempotency-key": key });
  const vpc = await (await request.post(`${api}/vpcs`, { headers: headers("launch-vpc"), data: { cidrBlock: "10.88.0.0/16" } })).json();
  const vpcId = vpc.items[0].vpcId;
  await expect.poll(async () => (await (await request.get(`${api}/vpcs`, { headers: headers("x") })).json()).items.find((v: { vpcId: string }) => v.vpcId === vpcId).state).toBe("available");
  const subnet = await (await request.post(`${api}/subnets`, { headers: headers("launch-subnet"), data: { vpcId, cidrBlock: "10.88.1.0/24" } })).json();
  const subnetId = subnet.items[0].subnetId;

  await page.goto("/compute/launch");
  await expect(page.getByText("Launch options could not be loaded")).toHaveCount(0);
  await page.getByPlaceholder("e.g. My Web Server").fill("launched-web");
  await expect(page.getByLabel("Image")).toHaveValue("ami-0123456789abcdef0");
  await page.getByLabel("Instance type").selectOption("vws.medium");
  await page.getByLabel("Network").selectOption(vpcId);
  await expect(page.getByLabel("Subnet")).toHaveValue(subnetId);
  await page.getByRole("button", { name: "Launch instance" }).click();

  await expect(page).toHaveURL(/\/compute\/instances$/, { timeout: 60_000 });
  const row = page.getByRole("row").filter({ hasText: "launched-web" });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("vws.medium");
});
