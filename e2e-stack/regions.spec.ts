import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test as base, type Page } from "@playwright/test";
import {
  apiURL,
  assertNoSecrets,
  canaries,
  origin,
  regionEndpoint,
  regionName,
  regionReadyURL,
  rootPassword,
  stackRoot,
  userPassword,
  writeTokens,
} from "./setup";

const name = regionName;
type Registration = { pveURL: string; tokenId: string; tokenSecret: string };
const registration = () => JSON.parse(readFileSync(resolve(stackRoot, "pve-token.json"), "utf8")) as Registration;

async function signIn(page: Page, user: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Account ID").fill("123456789012");
  await page.getByLabel("User name").fill(user);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/compute\/instances$/);
}

const test = base.extend<{ capture: void }>({
  capture: [
    async ({ page }, use) => {
      const traffic: string[] = [];
      page.on("console", (message) => traffic.push(message.text()));
      page.on("pageerror", (error) => traffic.push(error.message));
      await page.route("**/*", async (route) => {
        const response = await route.fetch({ maxRedirects: 0 });
        const body = await response.body();
        traffic.push(body.toString());
        await route.fulfill({ response, body });
      });
      await use();
      await page.unrouteAll({ behavior: "wait" });
      assertNoSecrets(traffic.join("\n"), [...canaries, registration().tokenSecret], "browser");
    },
    { auto: true },
  ],
});

test("root registers, tests, discovers, edits and removes a real region", async ({ page, request }) => {
  const { pveURL, tokenId, tokenSecret } = registration();
  await signIn(page, "root", rootPassword);
  await page.getByRole("button", { name: "Services" }).click();
  await page.getByRole("menuitem", { name: "Regions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Regions (0)", exact: true })).toBeVisible();
  await page.goto("/admin/regions/register");
  for (const [label, value] of Object.entries({
    "Region name": name,
    "Cluster name": "test",
    "Proxmox API URL 1": pveURL,
    "Region endpoint": regionEndpoint,
    "API token ID": tokenId,
    "API token secret": tokenSecret,
  }))
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel("CA certificate").fill(readFileSync(resolve(stackRoot, "pve-ca.pem"), "utf8"));
  await page.getByRole("button", { name: "Add Availability Zone" }).click();
  await page.getByLabel("Zone letter", { exact: true }).fill("a");
  await page.getByLabel("Nodes, separated by commas", { exact: true }).fill("pve1");
  await page.getByRole("button", { name: "Register region", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true, level: 1 })).toBeVisible();
  await expect.poll(async () => (await request.get(regionReadyURL)).status(), { timeout: 15_000 }).toBe(200);
  await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nodes (1)", exact: true })).toBeVisible();
  await expect(page.getByText("Online", { exact: true })).toBeVisible();
  await expect(page.getByText("API node", { exact: true })).toBeVisible();
  await expect(page.getByText("Leader", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("term").filter({ hasText: /^pve1$/ })).toBeVisible();
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  const fingerprint = createHash("sha256").update(tokenSecret).digest("hex").slice(0, 8);
  await expect(page.getByText(`Stored secret: Set · ${fingerprint}`, { exact: true })).toBeVisible();
  await expect(page.getByLabel("API token secret", { exact: true })).toHaveValue("");
  await page.getByLabel("API token secret", { exact: true }).fill(tokenSecret);
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  const steps = page.getByRole("table", { name: "Connection test steps" });
  await expect(steps.getByRole("cell", { name: "PASS", exact: true })).toHaveCount(5);
  await expect(steps.getByRole("row")).toHaveCount(6);
  await page.getByLabel("Zone letter", { exact: true }).fill("b");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Availability Zones", exact: true }).click();
  await expect(page.getByText(`${name}b`, { exact: true })).toBeVisible();
  const identity = readFileSync(resolve(stackRoot, "state/registration.json"), "utf8");
  expect(JSON.parse(identity) as { zones: { letter: string }[] }).toMatchObject({ zones: [{ letter: "b" }] });
  // Register the optional write tokens through the admin API (the form edits only the stored ones), then change the
  // CA: the daemon compares it byte for byte, so every secret has to be entered again.
  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) => cookie.name === "vws_session")!.value;
  const csrf = cookies.find((cookie) => cookie.name === "vws_csrf")!.value;
  const admin = { cookie: `__Host-vws_session=${session}; vws_csrf=${csrf}`, "x-csrf-token": csrf, origin };
  const current = await request.get(`${apiURL}/api/v1/admin/regions/${name}`, { headers: admin });
  const attached = await request.patch(`${apiURL}/api/v1/admin/regions/${name}`, {
    headers: { ...admin, "if-match": current.headers().etag },
    data: {
      firewallTokenId: writeTokens.firewall.id,
      firewallTokenSecret: writeTokens.firewall.secret,
      backupTokenId: writeTokens.backup.id,
      backupTokenSecret: writeTokens.backup.secret,
    },
  });
  expect(attached.status(), await attached.text()).toBe(200);
  expect(((await attached.json()) as { lastError?: unknown }).lastError ?? null).toBeNull();
  await page.goto(`/admin/regions/${name}/edit`);
  await expect(page.getByLabel("Firewall token secret", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Backup token secret", { exact: true })).toHaveValue("");
  const pem = readFileSync(resolve(stackRoot, "pve-ca.pem"), "utf8");
  await page.getByLabel("CA certificate").fill(`${pem}\n`);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Enter the API token secret again" })).toBeVisible();
  await page.getByLabel("API token secret", { exact: true }).fill(tokenSecret);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Enter the firewall token secret again" })).toBeVisible();
  await page.getByLabel("Firewall token secret", { exact: true }).fill(writeTokens.firewall.secret);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Enter the backup token secret again" })).toBeVisible();
  await page.getByLabel("Backup token secret", { exact: true }).fill(writeTokens.backup.secret);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/regions/${name}$`));
  const state = () =>
    JSON.parse(readFileSync(resolve(stackRoot, "state/registration.json"), "utf8")) as {
      caPem: string;
      firewallTokenId: string;
      backupTokenId: string;
    };
  expect(state()).toMatchObject({
    caPem: `${pem}\n`,
    firewallTokenId: writeTokens.firewall.id,
    backupTokenId: writeTokens.backup.id,
  });
  // The stored CA now ends in a newline. A zones-only edit must not send it trimmed, or the daemon would see a new
  // CA and ask for every secret again.
  await page.goto(`/admin/regions/${name}/edit`);
  await page.getByLabel("Zone letter", { exact: true }).fill("c");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/regions/${name}$`));
  expect(state().caPem).toBe(`${pem}\n`);
  await expect.poll(async () => (await request.get(regionReadyURL)).status(), { timeout: 15_000 }).toBe(200);
  await page.reload();
  await page.getByRole("banner").getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("menuitem", { name: new RegExp(name) })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `Delete ${name}?` });
  await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Confirm deletion" }).fill(name);
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Regions (0)", exact: true })).toBeVisible();
});

test("policy-free IAM user has no operator menu and admin routes return 403", async ({ page, request }) => {
  await signIn(page, "stack-user", userPassword);
  await page.getByRole("button", { name: "Services" }).click();
  await expect(page.getByRole("menuitem", { name: "Instances", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Regions", exact: true })).toHaveCount(0);
  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) => cookie.name === "vws_session")!.value;
  const csrf = cookies.find((cookie) => cookie.name === "vws_csrf")!.value;
  const headers = {
    cookie: `__Host-vws_session=${session}; vws_csrf=${csrf}`,
    "x-csrf-token": csrf,
    origin,
  };
  for (const [method, path] of [
    ["GET", "/permissions"],
    ["GET", "/regions"],
    ["GET", `/regions/${name}`],
    ["GET", `/regions/${name}/health`],
    ["POST", "/regions"],
    ["PATCH", `/regions/${name}`],
    ["DELETE", `/regions/${name}`],
    ["POST", `/regions/${name}/test`],
  ]) {
    const response = await request.fetch(`${apiURL}/api/v1/admin${path}`, { method, headers, data: {} });
    expect(response.status(), `${method} ${path}`).toBe(403);
    assertNoSecrets(await response.text(), [...canaries, registration().tokenSecret], `${method} ${path}`);
  }
  await page.goto("/admin/regions");
  await expect(page.getByRole("alert").filter({ hasText: "Access denied" })).toBeVisible();
});
