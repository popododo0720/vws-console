import { expect, test, type Page } from "@playwright/test";

const api = `http://127.0.0.1:${process.env.E2E_FAKE_API_PORT ?? 43321}`;
const ID = "123456789012";
const ACCOUNT = "210987654321";
const project = `${api}/api/v1/admin/projects/${ID}`;
const cookie = (user: string) => `__Host-vws_session=${user}; vws_csrf=${user}`;
const caller = (user: string) => ({ cookie: cookie(user), "x-csrf-token": user, origin: api, "if-match": '"0"' });

// The console keeps a session in two cookies of its own and forwards it to console-api (fake-console-api.mts).
const signIn = (page: Page, baseURL: string | undefined, user: string) =>
  page.context().addCookies(["vws_session", "vws_csrf"].map((name) => ({ name, value: user, url: baseURL })));
const pool = (page: Page) => page.getByLabel("Pool in pve-lab-1");
const save = (page: Page) => page.getByRole("button", { name: "Save changes" });

test.beforeEach(async ({ request }) => {
  await request.post(`${api}/__reset`);
  const data = { name: "pve-lab-1", clusterName: "lab", tokenSecret: "s" };
  expect((await request.post(`${api}/api/v1/admin/regions`, { headers: caller("root"), data })).status()).toBe(201);
});

test("an administrator maps a pool and an AWS account once; a reload shows both", async ({ page, baseURL }) => {
  await signIn(page, baseURL, "root");
  await page.goto(`/admin/projects/${ID}`);
  await expect(page.getByText("Default pools, not saved")).toBeVisible();
  await expect(page.getByRole("row", { name: `pve-lab-1 ${ID}` })).toBeVisible();
  await page.getByRole("link", { name: "Edit" }).click();
  await pool(page).fill("team-a");
  await page.getByRole("button", { name: "Add AWS account" }).click();
  await page.getByLabel("AWS account ID").fill(ACCOUNT);
  const posts: string[] = [];
  page.on("request", (request) => request.method() === "POST" && posts.push(request.url()));
  await save(page).dblclick();
  await expect(page.getByRole("row", { name: "pve-lab-1 team-a" })).toBeVisible();
  expect(posts).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole("row", { name: "pve-lab-1 team-a" })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "AWS accounts" }).click();
  await expect(page.getByRole("cell", { name: ACCOUNT })).toBeVisible();
});

test("an unknown pool is refused at its field; a stale save asks for a reload", async ({ page, baseURL, request }) => {
  await signIn(page, baseURL, "root");
  await page.goto(`/admin/projects/${ID}/edit`);
  await pool(page).fill("missing-pool");
  await save(page).click();
  const refused = /^pool missing-pool does not exist in region pve-lab-1$/;
  await expect(page.getByRole("alert").filter({ hasText: refused })).toBeVisible();
  const theirs = { pools: [{ region: "pve-lab-1", pool: "theirs" }], awsAccounts: [] };
  expect((await request.put(project, { headers: caller("root"), data: theirs })).status()).toBe(200);
  await pool(page).fill("mine");
  await save(page).click();
  await expect(page.getByText("registration already exists or changed. Reload the page")).toBeVisible();
  await page.reload();
  await expect(pool(page)).toHaveValue("theirs");
  await pool(page).fill("mine");
  await save(page).click();
  await expect(page.getByRole("row", { name: "pve-lab-1 mine" })).toBeVisible();
});

test("with only vws:AdminListRegions: Regions and the project open, nothing edits", async ({
  page,
  baseURL,
  request,
}) => {
  await signIn(page, baseURL, "viewer");
  await page.goto("/compute/instances");
  await page.getByRole("button", { name: "Services" }).click();
  await page.getByRole("menuitem", { name: "Regions" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Regions (1)" })).toBeVisible();
  await page.getByRole("link", { name: "pve-lab-1" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "pve-lab-1" })).toBeVisible();
  await page.goto(`/admin/projects/${ID}`);
  await expect(page.getByRole("row", { name: `pve-lab-1 ${ID}` })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
  await page.goto(`/admin/projects/${ID}/edit`);
  const denied = page.getByRole("alert").filter({ hasText: "Access denied" });
  await expect(denied).toContainText("You don't have permission to vws:AdminMapProject.");
  await expect(save(page)).toHaveCount(0);
  const write = await request.put(project, { headers: caller("viewer"), data: { pools: [], awsAccounts: [] } });
  expect(write.status()).toBe(403);
});
