import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const api = `http://127.0.0.1:${process.env.E2E_FAKE_API_PORT ?? 43321}`;
const CA = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";
const CANARY = "canary.S3cret-175_token";
const lab = {
  "Region name": "pve-lab-1",
  "Cluster name": "lab",
  "Proxmox API URL 1": "https://pve1.lab.example:8006",
  "CA certificate": CA,
  "Region endpoint": "https://10.0.0.10:8443",
  "API token ID": "vws@pve!console",
  "API token secret": CANARY,
};

test.beforeEach(async ({ request }) => {
  await request.post(`${api}/__reset`);
});

// The console keeps a session in two cookies of its own and forwards it to console-api (fake-console-api.mts).
const signIn = (page: Page, baseURL: string | undefined, user: string) =>
  page.context().addCookies(["vws_session", "vws_csrf"].map((name) => ({ name, value: user, url: baseURL })));

async function openServices(page: Page, baseURL: string | undefined, user: string) {
  await signIn(page, baseURL, user);
  await page.goto("/compute/instances");
  await page.getByRole("button", { name: "Services" }).click();
  await expect(page.getByRole("menuitem", { name: "Instances", exact: true })).toBeVisible();
}

async function fillRegister(page: Page, baseURL: string | undefined, values = lab) {
  await signIn(page, baseURL, "root");
  await page.goto("/admin/regions/register");
  for (const [label, value] of Object.entries(values)) await page.getByLabel(label, { exact: true }).fill(value);
  return page.getByRole("button", { name: "Register region" });
}

test("no admin permissions: no Regions menu item, and a direct URL is denied", async ({ page, baseURL }) => {
  await openServices(page, baseURL, "alice");
  await expect(page.getByRole("menuitem", { name: "Regions" })).toHaveCount(0);
  for (const path of ["", "/pve-lab-1", "/register", "/pve-lab-1/edit"]) {
    await page.goto(`/admin/regions${path}`);
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

test("a registered secret comes back only as its fingerprint", async ({ page, baseURL }) => {
  const traffic: (string | Promise<string>)[] = [];
  page.on("request", (request) => traffic.push(request.url()));
  page.on("response", (response) => traffic.push(response.text().catch(() => "")));
  await (await fillRegister(page, baseURL)).click();
  await page.getByRole("link", { name: "Edit" }).click();
  const fingerprint = createHash("sha256").update(CANARY).digest("hex").slice(0, 8);
  await expect(page.getByText(`Stored secret: Set · ${fingerprint}`)).toBeVisible();
  await expect(page.getByLabel("API token secret")).toHaveValue("");
  const stored = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]));
  const seen = [await page.content(), stored, ...(await Promise.all(traffic))];
  expect(seen.join("\n")).toContain(fingerprint);
  expect(seen.filter((text) => text.includes(CANARY)).map((text) => text.slice(0, 120))).toEqual([]);
});

test("console-api's field error shows at the field, and a double click registers once", async ({ page, baseURL }) => {
  const submit = await fillRegister(page, baseURL, { ...lab, "Cluster name": "not valid!" });
  await submit.click();
  await expect(page.getByRole("alert").filter({ hasText: /^invalid cluster name$/ })).toBeVisible();
  await page.getByLabel("Cluster name").fill("lab");
  const posts: string[] = [];
  page.on("request", (request) => request.method() === "POST" && posts.push(request.url()));
  await submit.dblclick();
  await expect(page.getByRole("heading", { level: 1, name: "pve-lab-1" })).toBeVisible();
  await expect(page.getByText("could not be registered")).toHaveCount(0);
  expect(posts).toHaveLength(1);
});

test("a save over another administrator's change shows the conflict and reloads", async ({
  page,
  baseURL,
  request,
}) => {
  await (await fillRegister(page, baseURL)).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("Cluster name")).toHaveValue("lab");
  const headers = { cookie: "__Host-vws_session=root; vws_csrf=root", "x-csrf-token": "root", origin: api };
  const theirs = { headers: { ...headers, "if-match": '"1"' }, data: { clusterName: "theirs" } };
  expect((await request.patch(`${api}/api/v1/admin/regions/pve-lab-1`, theirs)).status()).toBe(200);
  await page.getByLabel("Cluster name").fill("mine");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("pve-lab-1 was changed since you opened it.")).toBeVisible();
  await expect(page.getByLabel("Cluster name")).toHaveValue("theirs");
  await page.getByLabel("Cluster name").fill("mine");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("mine", { exact: true })).toBeVisible();
});

test("the PVE API URLs are a list: several are saved and shown, and bad ones are refused at the field", async ({
  page,
  baseURL,
  request,
}) => {
  const submit = await fillRegister(page, baseURL);
  await page.getByRole("button", { name: "Add Proxmox API URL" }).click();
  await page.getByLabel("Proxmox API URL 2", { exact: true }).fill("https://pve1.lab.example:8006/");
  await submit.click();
  await expect(page.getByRole("alert").filter({ hasText: "repeats the host" })).toBeVisible();
  await page.getByLabel("Proxmox API URL 2", { exact: true }).fill("https://pve2.lab.example:8006");
  await page.getByRole("button", { name: "Add Proxmox API URL" }).click();
  await page.getByLabel("Proxmox API URL 3", { exact: true }).fill("https://pve3.lab.example:8006");
  await page.getByRole("button", { name: "Remove Proxmox API URL 3" }).click();
  const sent: unknown[] = [];
  page.on("request", (r) => r.method() === "POST" && sent.push(r.postData()));
  await submit.click();
  await expect(page.getByRole("heading", { level: 1, name: "pve-lab-1" })).toBeVisible();
  const urls = page.getByRole("definition").filter({ hasText: "https://pve2.lab.example:8006" });
  await expect(urls).toContainText("https://pve1.lab.example:8006");
  const headers = { cookie: "__Host-vws_session=root; vws_csrf=root", "x-csrf-token": "root", origin: api };
  const old = { name: "pve-lab-3", clusterName: "lab", pveApiUrl: "https://pve1.lab.example:8006", caPem: CA };
  const refused = await request.post(`${api}/api/v1/admin/regions`, { headers, data: { ...old, tokenSecret: "s" } });
  expect(refused.status()).toBe(400);
  expect(sent).not.toEqual([]);
});

test("the region list shows the API node, not a leader", async ({ page, baseURL }) => {
  await (await fillRegister(page, baseURL)).click();
  await page.goto("/admin/regions");
  await expect(page.getByRole("columnheader", { name: "API node" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Leader" })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "pve1", exact: true })).toBeVisible();
});

test("a region is deleted only after its name is typed", async ({ page, baseURL }) => {
  await (await fillRegister(page, baseURL)).click();
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete pve-lab-1?" });
  await expect(dialog.getByRole("button", { name: "Delete" })).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Confirm deletion" }).fill("pve-lab-1");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Regions (0)" })).toBeVisible();
});

test("the fake console-api refuses a write without the session's CSRF token", async ({ request }) => {
  const register = async (cookie: string, token?: string) => {
    const headers = { cookie, origin: api, ...(token ? { "x-csrf-token": token } : {}) };
    const data = {
      name: "pve-lab-1",
      clusterName: "lab",
      pveApiUrls: ["https://pve1.lab.example:8006"],
      caPem: "-----BEGIN CERTIFICATE-----",
      tokenSecret: "s",
    };
    return (await request.post(`${api}/api/v1/admin/regions`, { headers, data })).status();
  };
  expect(await register("__Host-vws_session=root")).toBe(403);
  expect(await register("__Host-vws_session=root; vws_csrf=other", "other")).toBe(403);
  expect(await register("__Host-vws_session=root", "root")).toBe(201);
});

const headers = { cookie: "__Host-vws_session=root; vws_csrf=root", "x-csrf-token": "root", origin: api };

/** The cases scripts/check-proxmox-api-urls.sh runs against console-api's Go rules, sent to the fake. */
const fixture = JSON.parse(readFileSync("src/lib/vws-api/testdata/proxmox-api-urls.json", "utf8")) as {
  checks: { urls: string[]; ok: boolean }[];
  destinations: { stored: string; sent: string; same: boolean }[];
};

test("the fake console-api checks PVE API URLs and reuses a stored secret as console-api does", async ({ request }) => {
  const region = { name: "pve-lab-1", clusterName: "lab", caPem: CA, tokenId: "vws@pve!console" };
  for (const { urls, ok } of fixture.checks) {
    const answer = await request.post(`${api}/api/v1/admin/regions/test`, {
      headers,
      data: { ...region, pveApiUrls: urls, tokenSecret: CANARY },
    });
    expect([urls, answer.status()]).toEqual([urls, ok ? 200 : 400]);
  }
  for (const { stored, sent, same } of fixture.destinations) {
    await request.post(`${api}/__reset`);
    const created = await request.post(`${api}/api/v1/admin/regions`, {
      headers,
      data: { ...region, pveApiUrls: [stored], tokenSecret: CANARY },
    });
    const etag = created.headers().etag;
    const edited = await request.patch(`${api}/api/v1/admin/regions/pve-lab-1`, {
      headers: { ...headers, "if-match": etag },
      data: { pveApiUrls: [sent] },
    });
    expect([stored, sent, edited.status()]).toEqual([stored, sent, same ? 200 : 400]);
  }
});

test("an edit that adds an address asks for the write secrets again, and sends them without echoing the stored ones", async ({
  page,
  baseURL,
  request,
}) => {
  const created = await request.post(`${api}/api/v1/admin/regions`, {
    headers,
    data: {
      name: "pve-lab-1",
      clusterName: "lab",
      pveApiUrls: [lab["Proxmox API URL 1"]],
      caPem: `${CA}\n`,
      tokenId: "vws@pve!console",
      tokenSecret: CANARY,
      firewallTokenId: "vws@pve!firewall",
      firewallTokenSecret: "fw-canary-secret",
      backupTokenId: "vws@pve!backup",
      backupTokenSecret: "bk-canary-secret",
      regionEndpoint: "https://10.0.0.10:8443",
    },
  });
  expect(created.status()).toBe(201);
  await signIn(page, baseURL, "root");
  await page.goto("/admin/regions/pve-lab-1/edit");
  await expect(page.getByLabel("Firewall token secret")).toHaveValue("");
  expect(await page.content()).not.toContain("fw-canary-secret");
  await page.getByRole("button", { name: "Add Proxmox API URL" }).click();
  await page.getByLabel("Proxmox API URL 2", { exact: true }).fill("https://pve2.lab.example:8006");
  await page.getByLabel("API token secret", { exact: true }).fill(CANARY);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "firewall token secret again" })).toBeVisible();
  await page.getByLabel("Firewall token secret").fill("fw-new");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "backup token secret again" })).toBeVisible();
  await page.getByLabel("Backup token secret").fill("bk-new");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/admin\/regions\/pve-lab-1$/);
  const stored = (await (await request.get(`${api}/api/v1/admin/regions/pve-lab-1`, { headers })).json()) as Record<
    string,
    { fingerprint?: string } | string
  >;
  const print = (secret: string) => createHash("sha256").update(secret).digest("hex").slice(0, 8);
  expect(stored.firewallTokenSecret).toEqual({ set: true, fingerprint: print("fw-new") });
  expect(stored.backupTokenSecret).toEqual({ set: true, fingerprint: print("bk-new") });
  expect(stored.caPem).toBe(`${CA}\n`);
});

test("a save the daemon could not apply stays on the edit form, then shows on the detail page", async ({
  page,
  baseURL,
}) => {
  await (await fillRegister(page, baseURL, { ...lab, "CA certificate": `${CA}\n` })).click();
  await expect(page.getByRole("heading", { level: 1, name: "pve-lab-1" })).toBeVisible();
  await page.goto("/admin/regions/pve-lab-1/edit");
  await page.getByRole("button", { name: "Add Proxmox API URL" }).click();
  await page.getByLabel("Proxmox API URL 2", { exact: true }).fill("https://wrong-cluster.lab.example:8006");
  await page.getByLabel("API token secret", { exact: true }).fill(CANARY);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "applying it to the region daemon failed: cluster_name mismatch" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/edit$/);
  await page.getByRole("button", { name: "Remove Proxmox API URL 2" }).click();
  await page.getByLabel("Cluster name", { exact: true }).fill("lab-2");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/admin\/regions\/pve-lab-1$/);
  await expect(page.getByText("cluster_name mismatch")).toHaveCount(0);
});

test("the detail page shows the stored apply error of a region", async ({ page, baseURL, request }) => {
  const made = await request.post(`${api}/api/v1/admin/regions`, {
    headers,
    data: {
      name: "pve-lab-1",
      clusterName: "lab",
      pveApiUrls: ["https://wrong-cluster.lab.example:8006"],
      caPem: CA,
      tokenId: "vws@pve!console",
      tokenSecret: CANARY,
      regionEndpoint: "https://10.0.0.10:8443",
    },
  });
  expect(made.status()).toBe(201);
  await signIn(page, baseURL, "root");
  await page.goto("/admin/regions/pve-lab-1");
  await expect(page.getByRole("alert").filter({ hasText: "cluster_name mismatch" })).toBeVisible();
});
