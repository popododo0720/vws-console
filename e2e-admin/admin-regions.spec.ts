import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const api = `http://127.0.0.1:${process.env.E2E_FAKE_API_PORT ?? 43321}`;
const CANARY = "canary.S3cret-175_token";
const lab = {
  "Region name": "pve-lab-1",
  "Cluster name": "lab",
  "Proxmox API URL": "https://pve1.lab.example:8006",
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

/** Signs the administrator in and fills the register form with `values`. */
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

test("a region is deleted only after its name is typed", async ({ page, baseURL }) => {
  await (await fillRegister(page, baseURL)).click();
  await page.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete pve-lab-1?" });
  await expect(dialog.getByRole("button", { name: "Delete" })).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Confirm deletion" }).fill("pve-lab-1");
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Regions (0)" })).toBeVisible();
});
