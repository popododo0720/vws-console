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
  regionReadyURL,
  rootPassword,
  stackRoot,
  userPassword,
} from "./setup";

const name = "pve-stack-1";
type Registration = { pveURL: string; tokenId: string; tokenSecret: string };
const registration = () => JSON.parse(readFileSync(resolve(stackRoot, "registration.json"), "utf8")) as Registration;

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
    "Proxmox API URL": pveURL,
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
  await expect(page.getByText("pve1", { exact: true })).toBeVisible();
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
  const identity = readFileSync(resolve(stackRoot, "etc/pve/vws/registration.json"), "utf8");
  expect(JSON.parse(identity) as { zones: { letter: string }[] }).toMatchObject({ zones: [{ letter: "b" }] });
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
