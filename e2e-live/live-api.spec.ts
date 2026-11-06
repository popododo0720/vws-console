import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Every run of a spec, --repeat-each included, shares one console-api, so names and idempotency keys are unique per run.
const unique = (label: string) => `${label}-${randomUUID().slice(0, 8)}`;

async function dialogButton(page: Page, name: string) {
  await page.getByRole("dialog").getByRole("button", { name }).click();
}

// Lists page 10 rows sorted by ID, so a new resource can land on any page; the list's own filter brings it to page 1.
async function listRow(page: Page, text: string) {
  const filter = page.locator("input.field").and(page.getByRole("textbox", { name: /^(Find|Filter|Search)\b/ }));
  await filter.fill(text);
  return page.getByRole("row").filter({ hasText: text });
}

async function listItems<T>(request: APIRequestContext, path: string): Promise<T[]> {
  const items: T[] = [];
  let token = "";
  do {
    const page = await (
      await request.get(`${consoleApi()}${path}${token ? `?pageToken=${encodeURIComponent(token)}` : ""}`, {
        headers: apiHeaders("list"),
      })
    ).json();
    items.push(...page.items);
    token = page.nextPageToken ?? "";
  } while (token);
  return items;
}

async function createdIds(request: APIRequestContext, path: string, field: string, before: string[]) {
  let created: string[] = [];
  await expect
    .poll(async () => {
      const ids = (await listItems<Record<string, string>>(request, path)).map((item) => item[field]);
      created = ids.filter((id) => !before.includes(id));
      return created.length;
    })
    .toBeGreaterThan(0);
  return created;
}

test("creates and deletes a VPC, subnet and volume through the fake console-api", async ({ page, request }) => {
  await page.goto("/network/vpcs");
  await expect(page.getByText("VPCs could not be loaded")).toHaveCount(0);
  await expect(page.getByText("Sample data")).toHaveCount(0);

  await page.getByRole("button", { name: "Create VPC" }).first().click();
  await page.getByRole("dialog").getByLabel("IPv4 CIDR").fill("10.42.0.0/16");
  await dialogButton(page, "Create VPC");
  const vpcRow = await listRow(page, "10.42.0.0/16");
  await expect(vpcRow).toHaveCount(1);
  const vpcId = (await vpcRow.getByText(/^vpc-/).first().textContent())!.trim();

  await page.goto("/network/subnets");
  await page.getByRole("button", { name: "Create subnet" }).first().click();
  await page.getByRole("dialog").locator("select").selectOption(vpcId);
  await page.getByRole("dialog").getByPlaceholder("10.0.1.0/24").fill("10.42.1.0/24");
  await dialogButton(page, "Create subnet");
  const subnetRow = await listRow(page, "10.42.1.0/24");
  await expect(subnetRow).toContainText(vpcId);

  const volumesBefore = (await listItems<{ volumeId: string }>(request, "/volumes")).map((item) => item.volumeId);
  await page.goto("/storage/volumes");
  await page.getByRole("link", { name: "Create volume" }).click();
  await expect(page).toHaveURL(/\/storage\/volumes\/create$/);
  await page.getByLabel("Size (GiB)").fill("13");
  await page.getByLabel("IOPS").fill("4000");
  await page.getByRole("button", { name: "Create volume" }).dblclick();
  await expect(page).toHaveURL(/\/storage\/volumes$/);
  const created = await createdIds(request, "/volumes", "volumeId", volumesBefore);
  expect(created).toHaveLength(1);
  const [volumeId] = created;
  const volumeRow = await listRow(page, volumeId);
  await expect(volumeRow).toHaveCount(1);
  await expect(volumeRow).toContainText("13 GiB");
  await expect(volumeRow).toContainText("gp3");
  await expect(volumeRow).toContainText("4000");
  await expect(volumeRow).toContainText("125");

  await page.reload();
  await listRow(page, volumeId);
  await expect(volumeRow).toHaveCount(1);
  await expect.poll(async () => (await volumeRow.textContent()) ?? "", { timeout: 15_000 }).toMatch(/Available/);
  await volumeRow.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Delete volume" }).click();
  await dialogButton(page, "Delete");
  await expect(volumeRow).toHaveCount(0);

  await page.goto("/network/subnets");
  await (await listRow(page, "10.42.1.0/24")).getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Delete subnet" }).click();
  await expect(subnetRow).toHaveCount(0);

  await page.goto("/network/vpcs");
  await (await listRow(page, "10.42.0.0/16")).getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(vpcRow).toHaveCount(0);
});

test("shows the API error code when a create is rejected", async ({ page }) => {
  await page.goto("/network/vpcs");
  await page.getByRole("button", { name: "Create VPC" }).first().click();
  await page.getByRole("dialog").getByLabel("IPv4 CIDR").fill("not-a-cidr");
  await dialogButton(page, "Create VPC");
  const alert = page.getByRole("dialog").getByRole("alert");
  await expect(alert).toContainText("The VPC could not be created");
  await expect(alert).toContainText("Request ID");
});

test("shows the empty instance list from the API", async ({ page }) => {
  test.skip(
    test.info().repeatEachIndex > 0,
    "the instance list is empty only before the first repeat launches instances",
  );
  await page.goto("/compute/instances");
  await expect(page.getByText("No instances")).toBeVisible();
  await expect(page.getByText("Instances could not be loaded")).toHaveCount(0);
});

test("lists a seeded instance by its Name tag and stops it", async ({ page, request }) => {
  const api = `http://127.0.0.1:${Number(process.env.E2E_EC2_PORT ?? 48081) - 1}/api/v1`;
  const headers = (key: string) => ({ authorization: "Bearer dev-token", "idempotency-key": unique(key) });
  const vpc = await (
    await request.post(`${api}/vpcs`, { headers: headers("seed-vpc"), data: { cidrBlock: "10.77.0.0/16" } })
  ).json();
  const vpcId = vpc.items[0].vpcId;
  await expect
    .poll(async () => (await (await request.get(`${api}/vpcs/${vpcId}`, { headers: headers("x") })).json()).state)
    .toBe("available");
  const subnet = await (
    await request.post(`${api}/subnets`, {
      headers: headers("seed-subnet"),
      data: { vpcId, cidrBlock: "10.77.1.0/24" },
    })
  ).json();
  const run = await request.post(`${api}/instances`, {
    headers: headers("seed-run"),
    data: {
      imageId: "ami-0123456789abcdef0",
      instanceType: "vws.small",
      subnetId: subnet.items[0].subnetId,
      count: 1,
      tags: { Name: "e2e-web" },
    },
  });
  expect(run.status()).toBe(202);
  const instanceId = (await run.json()).items[0].instanceId;

  await page.goto("/compute/instances");
  const row = await listRow(page, instanceId);
  await expect(row).toContainText("e2e-web");
  await expect(row).toContainText("vws.small");
  await expect
    .poll(
      async () => {
        await page.reload();
        await listRow(page, instanceId);
        return (await row.textContent()) ?? "";
      },
      { timeout: 30_000 },
    )
    .toContain("Running");
  await row.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: /^Instance state/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Stop" }).click();
  await expect(row).toContainText("Stopped", { timeout: 60_000 });

  await page.goto(`/compute/instances/${instanceId}`);
  await expect(page.getByText(`${instanceId} (e2e-web)`).first()).toBeVisible();
  await expect(page.getByText(vpcId).first()).toBeVisible();
});

const consoleApi = () => `http://127.0.0.1:${Number(process.env.E2E_EC2_PORT ?? 48081) - 1}/api/v1`;
const apiHeaders = (key: string) => ({ authorization: "Bearer dev-token", "idempotency-key": unique(key) });

test("creates a security group, edits its inbound rules, copies it and deletes both", async ({ page, request }) => {
  const vpc = await (
    await request.post(`${consoleApi()}/vpcs`, {
      headers: apiHeaders("sg-seed-vpc"),
      data: { cidrBlock: "10.88.0.0/16" },
    })
  ).json();
  const vpcId = vpc.items[0].vpcId;
  const groupName = unique("e2e-web");

  await page.goto("/network/security-groups/create");
  await page.locator("input.field").first().fill(groupName);
  await page.locator("select.field").first().selectOption(vpcId);
  await page.getByRole("button", { name: "Add rule", exact: true }).click();
  await page.getByRole("button", { name: "Create security group" }).click();
  await expect(page).toHaveURL(/\/network\/security-groups$/);
  const row = await listRow(page, groupName);
  await expect(row).toContainText(vpcId);
  const groupId = (await row.getByText(/^sg-/).first().textContent())!.trim();

  await page.goto(`/network/security-groups/${groupId}`);
  await expect(page.getByText("Inbound rules (1)")).toBeVisible();
  await expect(page.getByRole("cell", { name: "22", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Outbound rules (—)" }).click();
  await expect(page.getByText("The VWS API does not report outbound rules yet.")).toBeVisible();
  await page.getByRole("button", { name: "Tags", exact: true }).click();
  await expect(page.getByText("The VWS API does not report security group tags yet.")).toBeVisible();

  await page.getByRole("button", { name: "Inbound rules (1)" }).click();
  await page.getByRole("button", { name: "Edit inbound rules" }).click();
  await expect(page).toHaveURL(new RegExp(`/network/security-groups/${groupId}/edit/inbound$`));
  await expect(page.getByRole("button", { name: "Save rules" })).toBeDisabled();
  await page.getByLabel("Rule 1 source").fill("10.88.1.9/16");
  await page.getByRole("button", { name: "Add rule", exact: true }).click();
  await page.getByLabel("Rule 2 type").selectOption({ label: "HTTPS" });
  await page.getByRole("button", { name: "Preview changes" }).click();
  const preview = page.getByRole("region", { name: "Preview changes" });
  await expect(preview).toContainText("Rules to delete (1)");
  await expect(preview).toContainText("TCP 22 from 0.0.0.0/0");
  await expect(preview).toContainText("Rules to add (2)");
  await expect(preview).toContainText("TCP 22 from 10.88.0.0/16");

  await page.getByRole("button", { name: "Save rules" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete inbound rules" });
  await expect(confirm).toContainText("TCP 22 from 0.0.0.0/0");
  await confirm.getByRole("button", { name: "Delete and save" }).click();
  await expect(page).toHaveURL(new RegExp(`/network/security-groups/${groupId}$`));
  await expect(page.getByText("Inbound rules (2)")).toBeVisible();
  await expect(page.getByRole("cell", { name: "10.88.0.0/16" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "0.0.0.0/0", exact: true })).toHaveCount(1);

  const stored = await listItems<{ groupId: string; ipPermissions: unknown[] }>(request, "/security-groups");
  const rules = stored.find((item) => item.groupId === groupId)!.ipPermissions;
  expect(rules).toEqual(
    expect.arrayContaining([
      { ipProtocol: "tcp", fromPort: 22, toPort: 22, cidrIp: "10.88.0.0/16" },
      { ipProtocol: "tcp", fromPort: 443, toPort: 443, cidrIp: "0.0.0.0/0" },
    ]),
  );
  expect(rules).toHaveLength(2);

  await page.goto(`/network/security-groups/${groupId}/edit/inbound`);
  await expect(page.getByRole("button", { name: "Save rules" })).toBeDisabled();

  await page.goto(`/network/security-groups/${groupId}`);
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Copy to new security group" }).click();
  await expect(page).toHaveURL(new RegExp(`/network/security-groups/create\\?copy=${groupId}$`));
  await expect(page.getByRole("status")).toContainText(groupId);
  await expect(page.getByLabel("Rule 1 source")).toHaveValue("10.88.0.0/16");
  const copyName = unique("e2e-web-copy");
  await page.locator("input.field").first().fill(copyName);
  await page.getByRole("button", { name: "Create security group" }).click();
  await expect(page).toHaveURL(/\/network\/security-groups$/);
  const copyRow = await listRow(page, copyName);
  await expect(copyRow).toContainText(vpcId);
  await expect(copyRow).toContainText("2");
  const copyId = (await copyRow.getByText(/^sg-/).first().textContent())!.trim();

  await page.goto(`/network/security-groups/${groupId}`);
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Delete security groups" }).click();
  const remove = page.getByRole("dialog", { name: "Delete security groups" });
  await expect(remove).toContainText(groupId);
  await remove.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(new RegExp(`/network/security-groups/${groupId}$`));
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Delete security groups" }).click();
  await remove.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/network\/security-groups$/);
  await expect(await listRow(page, groupId)).toHaveCount(0);

  const copyById = await listRow(page, copyId);
  await copyById.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Delete security groups" }).click();
  await remove.getByRole("button", { name: "Delete" }).click();
  await expect(copyById).toHaveCount(0);
});

test("allocates, associates, disassociates and releases an Elastic IP address", async ({ page, request }) => {
  const vpc = await (
    await request.post(`${consoleApi()}/vpcs`, {
      headers: apiHeaders("eip-seed-vpc"),
      data: { cidrBlock: "10.89.0.0/16" },
    })
  ).json();
  const vpcId = vpc.items[0].vpcId;
  await expect
    .poll(
      async () =>
        (await (await request.get(`${consoleApi()}/vpcs/${vpcId}`, { headers: apiHeaders("x") })).json()).state,
    )
    .toBe("available");
  const subnet = await (
    await request.post(`${consoleApi()}/subnets`, {
      headers: apiHeaders("eip-seed-subnet"),
      data: { vpcId, cidrBlock: "10.89.1.0/24" },
    })
  ).json();
  const run = await request.post(`${consoleApi()}/instances`, {
    headers: apiHeaders("eip-seed-run"),
    data: {
      imageId: "ami-0123456789abcdef0",
      instanceType: "vws.small",
      subnetId: subnet.items[0].subnetId,
      count: 1,
      tags: { Name: "e2e-eip" },
    },
  });
  const instanceId = (await run.json()).items[0].instanceId;
  await expect
    .poll(
      async () =>
        (await (await request.get(`${consoleApi()}/instances/${instanceId}`, { headers: apiHeaders("x") })).json())
          .state,
      { timeout: 30_000 },
    )
    .toBe("running");

  const before = (await listItems<{ allocationId: string }>(request, "/addresses")).map((item) => item.allocationId);
  await page.goto("/network/elastic-ips");
  await expect(page.getByText("Elastic IP addresses could not be loaded")).toHaveCount(0);
  await page.getByRole("button", { name: "Allocate Elastic IP address" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Allocate" }).click();
  const created = await createdIds(request, "/addresses", "allocationId", before);
  expect(created).toHaveLength(1);
  const [allocationId] = created;
  const byId = await listRow(page, allocationId);
  await expect(byId).toHaveCount(1);

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
  const volume = await (
    await request.post(`${consoleApi()}/volumes`, { headers: apiHeaders("snap-seed-vol"), data: { size: 7 } })
  ).json();
  const volumeId = volume.items[0].volumeId;
  await expect
    .poll(
      async () =>
        (await (await request.get(`${consoleApi()}/volumes/${volumeId}`, { headers: apiHeaders("x") })).json()).state,
    )
    .toBe("available");

  await page.goto("/storage/volumes");
  await (await listRow(page, volumeId)).getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Create snapshot", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/storage/snapshots/create\\?volumeId=${volumeId}$`));
  await expect(page.getByLabel("Volume ID")).toHaveValue(volumeId);
  const description = unique("e2e backup");
  await page.getByLabel("Description").fill(description);
  await page.getByRole("button", { name: "Create snapshot" }).dblclick();
  await expect(page).toHaveURL(/\/storage\/snapshots$/);
  await expect(page.getByText("Snapshots could not be loaded")).toHaveCount(0);
  const row = await listRow(page, description);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(volumeId);
  await expect(row).toContainText("7 GiB");
  await expect
    .poll(
      async () => {
        await page.reload();
        await listRow(page, description);
        return (await row.textContent()) ?? "";
      },
      { timeout: 15_000 },
    )
    .toContain("Completed");

  const snapshotId = (await row.getByRole("link", { name: /^snap-/ }).textContent())!.trim();
  await row.getByRole("link", { name: snapshotId }).click();
  await expect(page).toHaveURL(new RegExp(`/storage/snapshots/${snapshotId}$`));
  await expect(page.getByText("Available (100%)")).toBeVisible();
  await page.goto("/storage/snapshots");

  await (await listRow(page, description)).getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Create volume from snapshot" }).click();
  await expect(page).toHaveURL(new RegExp(`/storage/volumes/create\\?snapshotId=${snapshotId}$`));
  await expect(page.getByLabel(/Snapshot ID/)).toHaveValue(snapshotId);
  await expect(page.getByLabel("Size (GiB)")).toHaveValue("7");
  await page.goto("/storage/snapshots");

  await (await listRow(page, description)).getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Delete snapshot" }).click();
  await dialogButton(page, "Delete");
  await expect(row).toHaveCount(0);
});

test("launches an instance from the launch screen", async ({ page, request }) => {
  const api = `http://127.0.0.1:${Number(process.env.E2E_EC2_PORT ?? 48081) - 1}/api/v1`;
  const headers = (key: string) => ({ authorization: "Bearer dev-token", "idempotency-key": unique(key) });
  const vpc = await (
    await request.post(`${api}/vpcs`, { headers: headers("launch-vpc"), data: { cidrBlock: "10.88.0.0/16" } })
  ).json();
  const vpcId = vpc.items[0].vpcId;
  await expect
    .poll(async () => (await (await request.get(`${api}/vpcs/${vpcId}`, { headers: headers("x") })).json()).state)
    .toBe("available");
  const subnet = await (
    await request.post(`${api}/subnets`, {
      headers: headers("launch-subnet"),
      data: { vpcId, cidrBlock: "10.88.1.0/24" },
    })
  ).json();
  const subnetId = subnet.items[0].subnetId;

  await page.goto("/compute/launch");
  await expect(page.getByText("Launch options could not be loaded")).toHaveCount(0);
  const instanceName = unique("launched-web");
  await page.getByPlaceholder("e.g. My Web Server").fill(instanceName);
  await expect(page.getByLabel("VWS Machine Image (AMI)")).toHaveValue("ami-0123456789abcdef0");
  await page.getByLabel("Instance type", { exact: true }).selectOption("vws.medium");
  await page.getByLabel("Key pair name").selectOption("proceed-without");
  await page.getByRole("checkbox", { name: /I acknowledge/ }).check();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("VPC").selectOption(vpcId);
  await expect(page.getByLabel("Subnet", { exact: true })).toHaveValue(subnetId);
  await page.getByRole("button", { name: "Launch instance" }).click();

  await expect(page).toHaveURL(/\/compute\/instances$/, { timeout: 60_000 });
  const row = await listRow(page, instanceName);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("vws.medium");
});

const tagsApi = () => `http://127.0.0.1:${Number(process.env.E2E_EC2_PORT ?? 48081) - 1}/api/v1`;
const tagsHeaders = (key: string) => ({ authorization: "Bearer dev-token", "idempotency-key": unique(key) });

async function seedInstances(
  request: import("@playwright/test").APIRequestContext,
  prefix: string,
  cidr: string,
  count: number,
) {
  const vpc = await (
    await request.post(`${tagsApi()}/vpcs`, {
      headers: tagsHeaders(`${prefix}-vpc`),
      data: { cidrBlock: `${cidr}.0.0/16` },
    })
  ).json();
  const vpcId: string = vpc.items[0].vpcId;
  await expect
    .poll(
      async () => (await (await request.get(`${tagsApi()}/vpcs/${vpcId}`, { headers: tagsHeaders("x") })).json()).state,
    )
    .toBe("available");
  const subnet = await (
    await request.post(`${tagsApi()}/subnets`, {
      headers: tagsHeaders(`${prefix}-subnet`),
      data: { vpcId, cidrBlock: `${cidr}.1.0/24` },
    })
  ).json();
  const run = await (
    await request.post(`${tagsApi()}/instances`, {
      headers: tagsHeaders(`${prefix}-run`),
      data: {
        imageId: "ami-0123456789abcdef0",
        instanceType: "vws.small",
        subnetId: subnet.items[0].subnetId,
        count,
        tags: { Name: `${prefix}-old` },
      },
    })
  ).json();
  const ids: string[] = run.items.map((item: { instanceId: string }) => item.instanceId);
  for (const id of ids) {
    await expect
      .poll(
        async () =>
          (await (await request.get(`${tagsApi()}/instances/${id}`, { headers: tagsHeaders("x") })).json()).state,
        { timeout: 30_000 },
      )
      .toBe("running");
  }
  return { vpcId, subnetId: subnet.items[0].subnetId as string, ids };
}

test("renames an instance through its Name tag from the list and the detail page", async ({ page, request }) => {
  const { ids } = await seedInstances(request, "rename", "10.55", 1);
  const [id] = ids;

  await page.goto("/compute/instances");
  const row = await listRow(page, id);
  await expect(row).toContainText("rename-old");
  await row.getByRole("button", { name: "Edit name" }).click();
  await row.getByLabel("Name").fill("rename-new");
  await row.getByLabel("Name").press("Enter");
  await expect(row).toContainText("rename-new");

  await page.goto(`/compute/instances/${id}`);
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Edit Name tag" }).click();
  await page.getByLabel("Instance name").fill("rename-detail");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`${id} (rename-detail)`).first()).toBeVisible();
});

test("stops and terminates several instances in one batch", async ({ page, request }) => {
  const { vpcId, ids } = await seedInstances(request, "batch", "10.56", 2);

  await page.goto("/compute/instances");
  await expect(await listRow(page, vpcId)).toHaveCount(2);
  for (const id of ids) await page.getByRole("row").filter({ hasText: id }).getByRole("checkbox").check();
  await page
    .getByRole("button", { name: /^Instance state/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Stop" }).click();
  for (const id of ids)
    await expect(page.getByRole("row").filter({ hasText: id })).toContainText("Stopped", { timeout: 60_000 });

  for (const id of ids) await page.getByRole("row").filter({ hasText: id }).getByRole("checkbox").check();
  await page
    .getByRole("button", { name: /^Instance state/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Terminate" }).click();
  for (const id of ids)
    await expect(page.getByRole("row").filter({ hasText: id })).toContainText("Terminated", { timeout: 60_000 });
});

test("opens VPC and volume detail pages from their lists", async ({ page, request }) => {
  const { vpcId, subnetId } = await seedInstances(request, "detail", "10.57", 1);
  const volume = await (
    await request.post(`${tagsApi()}/volumes`, { headers: tagsHeaders("detail-vol"), data: { size: 6 } })
  ).json();
  const volumeId: string = volume.items[0].volumeId;

  await page.goto("/network/vpcs");
  await (await listRow(page, vpcId)).getByRole("link", { name: vpcId }).click();
  await expect(page).toHaveURL(new RegExp(`/network/vpcs/${vpcId}$`));
  await expect(page.getByText("10.57.0.0/16")).toBeVisible();
  await expect(page.getByText(subnetId)).toBeVisible();
  await expect(page.locator("dt", { hasText: /^Default VPC$/ }).locator("..")).toContainText("No");

  await page.goto("/storage/volumes");
  await (await listRow(page, volumeId)).getByRole("link", { name: volumeId }).click();
  await expect(page).toHaveURL(new RegExp(`/storage/volumes/${volumeId}$`));
  await expect(page.getByText("6 GiB")).toBeVisible();

  await page.goto("/storage/volumes/vol-0000000000000000f");
  await expect(page.getByText("Volume not found")).toBeVisible();
});

const liveApi = () => `http://127.0.0.1:${Number(process.env.E2E_EC2_PORT ?? 48081) - 1}/api/v1`;
const liveHeaders = (key: string) => ({ authorization: "Bearer dev-token", "idempotency-key": unique(key) });

test("grows a volume and will not shrink it", async ({ page, request }) => {
  const created = await (
    await request.post(`${liveApi()}/volumes`, { headers: liveHeaders("grow-vol"), data: { size: 5 } })
  ).json();
  const volumeId = created.items[0].volumeId;
  await expect
    .poll(
      async () =>
        (await (await request.get(`${liveApi()}/volumes/${volumeId}`, { headers: liveHeaders("x") })).json()).state,
    )
    .toBe("available");

  await page.goto("/storage/volumes");
  const row = await listRow(page, volumeId);
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

test("shows instance VPC and launch time, subnet zone and public IP setting, and the default VPC flag", async ({
  page,
  request,
}) => {
  const vpc = await (
    await request.post(`${liveApi()}/vpcs`, { headers: liveHeaders("fields-vpc"), data: { cidrBlock: "10.66.0.0/16" } })
  ).json();
  const vpcId = vpc.items[0].vpcId;
  await expect
    .poll(
      async () => (await (await request.get(`${liveApi()}/vpcs/${vpcId}`, { headers: liveHeaders("x") })).json()).state,
    )
    .toBe("available");
  const subnet = await (
    await request.post(`${liveApi()}/subnets`, {
      headers: liveHeaders("fields-subnet"),
      data: { vpcId, cidrBlock: "10.66.1.0/24" },
    })
  ).json();
  const subnetId = subnet.items[0].subnetId;
  const run = await (
    await request.post(`${liveApi()}/instances`, {
      headers: liveHeaders("fields-run"),
      data: { imageId: "ami-0123456789abcdef0", instanceType: "vws.small", subnetId, count: 1 },
    })
  ).json();
  const instanceId = run.items[0].instanceId;
  const launchTime: string = run.items[0].launchTime;

  await page.goto("/compute/instances");
  const instanceRow = await listRow(page, instanceId);
  await expect(instanceRow).toContainText(vpcId);
  await expect(instanceRow).toContainText(launchTime);

  await page.goto("/network/subnets");
  const subnetRow = await listRow(page, subnetId);
  await expect(subnetRow).toContainText("vws-1a");
  await subnetRow.getByRole("checkbox").check();
  await expect(page.getByText("Auto-assign public IPv4 address").locator("..")).toContainText("No");

  await page.goto("/network/vpcs");
  const vpcRow = await listRow(page, vpcId);
  await vpcRow.getByRole("checkbox").check();
  await expect(page.locator("dt", { hasText: /^Default VPC$/ }).locator("..")).toContainText("No");
});

const netApi = () => `http://127.0.0.1:${Number(process.env.E2E_EC2_PORT ?? 48081) - 1}/api/v1`;
const netHeaders = (key: string) => ({ authorization: "Bearer dev-token", "idempotency-key": unique(key) });

test("names a VPC and a subnet on create, renames them and shows their tags", async ({ page }) => {
  const vpcName = unique("e2e-net");
  await page.goto("/network/vpcs");
  await page.getByRole("button", { name: "Create VPC" }).first().click();
  await page.getByRole("dialog").getByLabel("VPC name").fill(vpcName);
  await page.getByRole("dialog").getByLabel("IPv4 CIDR").fill("10.44.0.0/16");
  await page.getByRole("dialog").getByRole("button", { name: "Create VPC" }).click();
  const named = await listRow(page, vpcName);
  await expect(named).toContainText("10.44.0.0/16");
  const vpcId = (await named.getByText(/^vpc-/).first().textContent())!.trim();

  const vpcRow = await listRow(page, vpcId);
  await vpcRow.getByRole("button", { name: "Edit name" }).click();
  await vpcRow.getByLabel("Name").fill(`${vpcName}-2`);
  await vpcRow.getByLabel("Name").press("Enter");
  await expect(vpcRow).toContainText(`${vpcName}-2`);
  await vpcRow.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Tags" }).click();
  await expect(page.getByRole("cell", { name: `${vpcName}-2`, exact: true })).toBeVisible();

  await page.goto(`/network/vpcs/${vpcId}`);
  await expect(page.getByText(`${vpcName}-2`).first()).toBeVisible();

  const subnetName = unique("e2e-sub");
  await page.goto("/network/subnets");
  await page.getByRole("button", { name: "Create subnet" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Subnet name").fill(subnetName);
  await dialog.locator("select").selectOption(vpcId);
  await dialog.getByPlaceholder("10.0.1.0/24").fill("10.44.1.0/24");
  await dialog.getByRole("button", { name: "Create subnet" }).click();
  const subnetNamed = await listRow(page, subnetName);
  await expect(subnetNamed).toContainText("10.44.1.0/24");
  const subnetId = (await subnetNamed
    .getByText(/^subnet-/)
    .first()
    .textContent())!.trim();

  const subnetRow = await listRow(page, subnetId);
  await subnetRow.getByRole("button", { name: "Edit name" }).click();
  await subnetRow.getByLabel("Name").fill(`${subnetName}-2`);
  await subnetRow.getByLabel("Name").press("Enter");
  await expect(subnetRow).toContainText(`${subnetName}-2`);
  await subnetRow.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Tags" }).click();
  await expect(page.getByRole("cell", { name: `${subnetName}-2`, exact: true })).toBeVisible();
});

test("shows an instance's public IP and Elastic IP allocation", async ({ page, request }) => {
  const vpc = await (
    await request.post(`${netApi()}/vpcs`, { headers: netHeaders("pip-vpc"), data: { cidrBlock: "10.45.0.0/16" } })
  ).json();
  const vpcId = vpc.items[0].vpcId;
  await expect
    .poll(
      async () => (await (await request.get(`${netApi()}/vpcs/${vpcId}`, { headers: netHeaders("x") })).json()).state,
    )
    .toBe("available");
  const subnet = await (
    await request.post(`${netApi()}/subnets`, {
      headers: netHeaders("pip-subnet"),
      data: { vpcId, cidrBlock: "10.45.1.0/24" },
    })
  ).json();
  const run = await (
    await request.post(`${netApi()}/instances`, {
      headers: netHeaders("pip-run"),
      data: {
        imageId: "ami-0123456789abcdef0",
        instanceType: "vws.small",
        subnetId: subnet.items[0].subnetId,
        count: 1,
      },
    })
  ).json();
  const instanceId: string = run.items[0].instanceId;
  await expect
    .poll(
      async () =>
        (await (await request.get(`${netApi()}/instances/${instanceId}`, { headers: netHeaders("x") })).json()).state,
      { timeout: 30_000 },
    )
    .toBe("running");
  const eip = await (await request.post(`${netApi()}/addresses`, { headers: netHeaders("pip-eip"), data: {} })).json();
  const allocationId: string = eip.items[0].allocationId;
  const publicIp: string = eip.items[0].publicIp;
  const assoc = await request.post(`${netApi()}/addresses/${allocationId}/associate`, {
    headers: netHeaders("pip-assoc"),
    data: { instanceId },
  });
  expect(assoc.status()).toBe(202);
  await expect
    .poll(
      async () =>
        (await (await request.get(`${netApi()}/instances/${instanceId}`, { headers: netHeaders("x") })).json())
          .publicIpAddress,
    )
    .toBe(publicIp);

  await page.goto("/compute/instances");
  const row = await listRow(page, instanceId);
  await expect(row).toContainText(publicIp);
  await expect(row).toContainText(allocationId);

  await page.goto(`/compute/instances/${instanceId}`);
  await expect(page.getByText(publicIp).first()).toBeVisible();
  await page.getByRole("button", { name: "Networking" }).click();
  await expect(page.getByText(allocationId)).toHaveCount(2);
});

test("counts a VPC created through the API on the VPC dashboard", async ({ page, request }) => {
  const countInCard = async () => {
    const text = await page.getByRole("region", { name: "VPCs" }).getByRole("link", { name: /^\d+$/ }).textContent();
    return Number(text);
  };
  await page.goto("/network");
  await expect(page.getByRole("heading", { name: "Resources by Region" })).toBeVisible();
  await expect(page.getByText("could not be loaded")).toHaveCount(0);
  const before = await countInCard();

  const created = await request.post(`${consoleApi()}/vpcs`, {
    headers: apiHeaders("dashboard-seed-vpc"),
    data: { cidrBlock: "10.93.0.0/16" },
  });
  expect(created.status()).toBe(202);

  await page.getByRole("button", { name: "Refresh Resources" }).click();
  await expect.poll(countInCard).toBe(before + 1);
  await page.reload();
  expect(await countInCard()).toBe(before + 1);
});

test("shows the empty NAT gateways list", async ({ page }) => {
  await page.goto("/network/nat-gateways");
  await expect(page.getByRole("heading", { name: "NAT gateways", exact: true })).toBeVisible();
  await expect(page.getByText("No NAT gateways found")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Select a NAT gateway" })).toBeVisible();
});

test("creates, imports and deletes key pairs from the Key pairs pages", async ({ page, request }) => {
  const created = unique("e2e-key");
  const imported = unique("e2e-import");

  await page.goto("/network/key-pairs");
  await page.getByRole("button", { name: "Create key pair" }).click();
  await expect(page).toHaveURL(/\/network\/key-pairs\/create$/);
  await page.getByRole("textbox", { name: "Name" }).fill(created);
  await page.getByRole("radio", { name: "ED25519" }).check();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Create key pair" }).click();
  expect((await download).suggestedFilename()).toBe(`${created}.pem`);
  const dialog = page.getByRole("dialog", { name: "Download private key" });
  await dialog.getByRole("button", { name: "Close" }).last().click();
  await expect(page).toHaveURL(/\/network\/key-pairs$/);
  const createdRow = await listRow(page, created);
  await expect(createdRow).toContainText("ED25519");
  await expect(createdRow).toContainText(/key-[0-9a-f]+/);

  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Import key pair" }).click();
  await expect(page).toHaveURL(/\/network\/key-pairs\/import$/);
  await page.getByRole("textbox", { name: "Name" }).fill(imported);
  await page
    .getByRole("textbox", { name: "Public key contents" })
    .fill("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJo+RmvgVTZXJbeHRr1s/lPbHK0wo4uo6k7gv4q6K9P4 e2e");
  await page.getByRole("button", { name: "Import key pair" }).click();
  await expect(page).toHaveURL(/\/network\/key-pairs$/);
  await expect(await listRow(page, imported)).toHaveCount(1);

  const stored = await listItems<{ keyName: string; keyMaterial?: string }>(request, "/key-pairs");
  expect(stored.filter((item) => item.keyName === created || item.keyName === imported)).toHaveLength(2);
  expect(stored.some((item) => item.keyMaterial)).toBe(false);

  for (const name of [created, imported]) {
    const row = await listRow(page, name);
    await row.getByRole("checkbox").check();
    await page.getByRole("button", { name: /^Actions/ }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("dialog", { name: "Delete key pair" }).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0);
  }
  const after = await listItems<{ keyName: string }>(request, "/key-pairs");
  expect(after.some((item) => item.keyName === created || item.keyName === imported)).toBe(false);
});

test("attaches a volume from its attach page and detaches it from the volume detail page", async ({
  page,
  request,
}) => {
  const vpc = await (
    await request.post(`${liveApi()}/vpcs`, { headers: liveHeaders("attach-vpc"), data: { cidrBlock: "10.55.0.0/16" } })
  ).json();
  const vpcId = vpc.items[0].vpcId;
  await expect
    .poll(
      async () => (await (await request.get(`${liveApi()}/vpcs/${vpcId}`, { headers: liveHeaders("x") })).json()).state,
    )
    .toBe("available");
  const subnet = await (
    await request.post(`${liveApi()}/subnets`, {
      headers: liveHeaders("attach-subnet"),
      data: { vpcId, cidrBlock: "10.55.1.0/24" },
    })
  ).json();
  const run = await (
    await request.post(`${liveApi()}/instances`, {
      headers: liveHeaders("attach-run"),
      data: {
        imageId: "ami-0123456789abcdef0",
        instanceType: "vws.small",
        subnetId: subnet.items[0].subnetId,
        count: 1,
        tags: { Name: "attach-web" },
      },
    })
  ).json();
  const instanceId: string = run.items[0].instanceId;
  const created = await (
    await request.post(`${liveApi()}/volumes`, { headers: liveHeaders("attach-vol"), data: { size: 6 } })
  ).json();
  const volumeId: string = created.items[0].volumeId;
  await expect
    .poll(async () => {
      const [volumeState, instanceState] = await Promise.all([
        request.get(`${liveApi()}/volumes/${volumeId}`, { headers: liveHeaders("x") }).then((reply) => reply.json()),
        request
          .get(`${liveApi()}/instances/${instanceId}`, { headers: liveHeaders("x") })
          .then((reply) => reply.json()),
      ]);
      return [volumeState.state, instanceState.state];
    })
    .toEqual(["available", "running"]);

  await page.goto("/storage/volumes");
  const row = await listRow(page, volumeId);
  await row.getByRole("checkbox").check();
  await page.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Attach volume" }).click();
  await expect(page).toHaveURL(new RegExp(`/storage/volumes/${volumeId}/attach$`));
  await expect(page.getByRole("heading", { name: "Attach volume", level: 1 })).toBeVisible();
  await expect(page.getByLabel("Volume ID")).toHaveValue(volumeId);
  await page.getByLabel("Instance").selectOption(instanceId);
  await page.getByRole("button", { name: "Attach volume" }).dblclick();
  await expect(page).toHaveURL(/\/storage\/volumes$/);

  await listRow(page, volumeId);
  await expect(row).toContainText("In-use");
  await expect(row).toContainText(`${instanceId}: /dev/sdf`);

  await page.goto(`/storage/volumes/${volumeId}`);
  await page.getByRole("button", { name: /^Actions/ }).click();
  await expect(page.getByRole("menuitem", { name: "Attach volume" })).toBeDisabled();
  await page.getByRole("menuitem", { name: "Detach volume" }).click();
  const dialog = page.getByRole("dialog", { name: "Detach volume" });
  await expect(dialog).toContainText(`from instance ${instanceId} (/dev/sdf)`);
  await dialog.getByRole("button", { name: "Detach" }).click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(
      async () => {
        await page.reload();
        return (
          (await page
            .locator("dt", { hasText: /^Volume state$/ })
            .locator("..")
            .textContent()) ?? ""
        );
      },
      { timeout: 30_000 },
    )
    .toContain("Available");
  await expect(page.locator("dt", { hasText: /^Attached resources$/ }).locator("..")).toContainText("—");
});
