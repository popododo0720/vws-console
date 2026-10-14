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

const consoleApi = () => `http://127.0.0.1:${Number(process.env.E2E_EC2_PORT ?? 48081) - 1}/api/v1`;
const apiHeaders = (key: string) => ({ authorization: "Bearer dev-token", "idempotency-key": key });

test("creates a security group with an inbound rule, adds a rule and deletes it", async ({ page, request }) => {
  const vpc = await (await request.post(`${consoleApi()}/vpcs`, { headers: apiHeaders("sg-seed-vpc"), data: { cidrBlock: "10.88.0.0/16" } })).json();
  const vpcId = vpc.items[0].vpcId;

  await page.goto("/network/security-groups/create");
  await page.locator("input.field").first().fill("e2e-web");
  await page.locator("select.field").first().selectOption(vpcId);
  await page.getByRole("button", { name: "Add rule", exact: true }).click();
  await page.getByRole("button", { name: "Create security group" }).click();
  await expect(page).toHaveURL(/\/network\/security-groups$/);
  const row = page.getByRole("row").filter({ hasText: "e2e-web" });
  await expect(row).toContainText(vpcId);
  const groupId = (await row.getByText(/^sg-/).first().textContent())!.trim();

  await page.goto(`/network/security-groups/${groupId}`);
  await expect(page.getByText("Inbound rules (1)")).toBeVisible();
  await expect(page.getByRole("cell", { name: "22", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Outbound rules (—)" }).click();
  await expect(page.getByText("The VWS API does not report outbound rules yet.")).toBeVisible();

  await page.goto(`/network/security-groups/${groupId}/edit/inbound`);
  await page.getByRole("button", { name: "Add rule", exact: true }).click();
  await page.locator("tbody").last().locator("select").first().selectOption({ label: "HTTPS" });
  await page.getByRole("button", { name: "Add rules" }).click();
  await expect(page).toHaveURL(new RegExp(`/network/security-groups/${groupId}$`));
  await expect(page.getByText("Inbound rules (2)")).toBeVisible();
  await expect(page.getByRole("cell", { name: "443", exact: true })).toBeVisible();

  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Delete security groups" }).click();
  await expect(page).toHaveURL(/\/network\/security-groups$/);
  await expect(page.getByRole("row").filter({ hasText: groupId })).toHaveCount(0);
});

test("allocates, associates, disassociates and releases an Elastic IP address", async ({ page, request }) => {
  const vpc = await (await request.post(`${consoleApi()}/vpcs`, { headers: apiHeaders("eip-seed-vpc"), data: { cidrBlock: "10.89.0.0/16" } })).json();
  const vpcId = vpc.items[0].vpcId;
  await expect.poll(async () => (await (await request.get(`${consoleApi()}/vpcs`, { headers: apiHeaders("x") })).json()).items.find((v: { vpcId: string }) => v.vpcId === vpcId).state).toBe("available");
  const subnet = await (await request.post(`${consoleApi()}/subnets`, { headers: apiHeaders("eip-seed-subnet"), data: { vpcId, cidrBlock: "10.89.1.0/24" } })).json();
  const run = await request.post(`${consoleApi()}/instances`, {
    headers: apiHeaders("eip-seed-run"),
    data: { imageId: "ami-0123456789abcdef0", instanceType: "vws.small", subnetId: subnet.items[0].subnetId, count: 1, tags: { Name: "e2e-eip" } },
  });
  const instanceId = (await run.json()).items[0].instanceId;
  await expect.poll(async () => (await (await request.get(`${consoleApi()}/instances/${instanceId}`, { headers: apiHeaders("x") })).json()).state, { timeout: 30_000 }).toBe("running");

  await page.goto("/network/elastic-ips");
  await expect(page.getByText("Elastic IP addresses could not be loaded")).toHaveCount(0);
  const before = await page.getByRole("row").filter({ hasText: /eipalloc-/ }).count();
  await page.getByRole("button", { name: "Allocate Elastic IP address" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Allocate" }).click();
  const rows = page.getByRole("row").filter({ hasText: /eipalloc-/ });
  await expect(rows).toHaveCount(before + 1);
  const row = rows.last();
  const allocationId = (await row.getByText(/^eipalloc-/).first().textContent())!.trim();
  const byId = page.getByRole("row").filter({ hasText: allocationId });

  await byId.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Associate Elastic IP address", exact: true }).click();
  await page.getByRole("dialog").locator("select").selectOption(instanceId);
  await page.getByRole("dialog").getByRole("button", { name: "Associate" }).click();
  await expect(byId).toContainText(instanceId);

  await byId.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Disassociate Elastic IP address" }).click();
  await expect(byId).not.toContainText(instanceId);

  await byId.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Release Elastic IP addresses" }).click();
  await expect(byId).toHaveCount(0);
});

test("creates a snapshot from a volume and deletes it", async ({ page, request }) => {
  const volume = await (await request.post(`${consoleApi()}/volumes`, { headers: apiHeaders("snap-seed-vol"), data: { size: 7 } })).json();
  const volumeId = volume.items[0].volumeId;
  await expect.poll(async () => (await (await request.get(`${consoleApi()}/volumes`, { headers: apiHeaders("x") })).json()).items.find((v: { volumeId: string }) => v.volumeId === volumeId).state).toBe("available");

  await page.goto("/storage/snapshots");
  await expect(page.getByText("Snapshots could not be loaded")).toHaveCount(0);
  await page.getByRole("button", { name: "Create snapshot" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("select").selectOption(volumeId);
  await dialog.locator("input.field").fill("e2e backup");
  await dialog.getByRole("button", { name: "Create snapshot" }).click();
  const row = page.getByRole("row").filter({ hasText: "e2e backup" });
  await expect(row).toContainText(volumeId);
  await expect(row).toContainText("7 GiB");
  await expect.poll(async () => { await page.reload(); return (await row.textContent()) ?? ""; }, { timeout: 15_000 }).toContain("Completed");

  await row.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Delete snapshot" }).click();
  await expect(row).toHaveCount(0);
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

const liveApi = () => `http://127.0.0.1:${Number(process.env.E2E_EC2_PORT ?? 48081) - 1}/api/v1`;
const liveHeaders = (key: string) => ({ authorization: "Bearer dev-token", "idempotency-key": key });

test("grows a volume and will not shrink it", async ({ page, request }) => {
  const created = await (await request.post(`${liveApi()}/volumes`, { headers: liveHeaders("grow-vol"), data: { size: 5 } })).json();
  const volumeId = created.items[0].volumeId;
  await expect.poll(async () => (await (await request.get(`${liveApi()}/volumes`, { headers: liveHeaders("x") })).json()).items.find((v: { volumeId: string }) => v.volumeId === volumeId).state).toBe("available");

  await page.goto("/storage/volumes");
  const row = page.getByRole("row").filter({ hasText: volumeId });
  await row.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Modify volume" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("New size (GiB)").fill("4");
  await expect(dialog.getByRole("button", { name: "Modify" })).toBeDisabled();
  await dialog.getByLabel("New size (GiB)").fill("12");
  await dialog.getByRole("button", { name: "Modify" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toContainText("12 GiB");
});

test("shows instance VPC and launch time, subnet zone and public IP setting, and the default VPC flag", async ({ page, request }) => {
  const vpc = await (await request.post(`${liveApi()}/vpcs`, { headers: liveHeaders("fields-vpc"), data: { cidrBlock: "10.66.0.0/16" } })).json();
  const vpcId = vpc.items[0].vpcId;
  await expect.poll(async () => (await (await request.get(`${liveApi()}/vpcs`, { headers: liveHeaders("x") })).json()).items.find((v: { vpcId: string }) => v.vpcId === vpcId).state).toBe("available");
  const subnet = await (await request.post(`${liveApi()}/subnets`, { headers: liveHeaders("fields-subnet"), data: { vpcId, cidrBlock: "10.66.1.0/24" } })).json();
  const subnetId = subnet.items[0].subnetId;
  const run = await (await request.post(`${liveApi()}/instances`, {
    headers: liveHeaders("fields-run"),
    data: { imageId: "ami-0123456789abcdef0", instanceType: "vws.small", subnetId, count: 1 },
  })).json();
  const instanceId = run.items[0].instanceId;
  const launchTime: string = run.items[0].launchTime;

  await page.goto("/compute/instances");
  const instanceRow = page.getByRole("row").filter({ hasText: instanceId });
  await expect(instanceRow).toContainText(vpcId);
  await expect(instanceRow).toContainText(launchTime);

  await page.goto("/network/subnets");
  const subnetRow = page.getByRole("row").filter({ hasText: subnetId });
  await expect(subnetRow).toContainText("vws-1a");
  await subnetRow.getByRole("checkbox").check();
  await expect(page.getByText("Auto-assign public IPv4 address").locator("..")).toContainText("No");

  await page.goto("/network/vpcs");
  const vpcRow = page.getByRole("row").filter({ hasText: vpcId });
  await vpcRow.getByRole("checkbox").check();
  await expect(page.locator("dt", { hasText: /^Default VPC$/ }).locator("..")).toContainText("No");
});
