import { expect, test, type Page } from "@playwright/test";

const account = "123456789012";

async function signIn(page: Page, password: string) {
  await page.getByLabel("Account ID").fill(account);
  await page.getByLabel("User name").fill("root");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("redirects to the login screen and back to the page after sign-in", async ({ page }) => {
    await page.goto("/network/vpcs");
    await expect(page).toHaveURL(/\/login\?next=%2Fnetwork%2Fvpcs$/);

    await signIn(page, "wrong-password");
    await expect(page.getByText(/^Sign-in failed/)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await signIn(page, process.env.E2E_ROOT_PASSWORD!);
    await expect(page).toHaveURL(/\/network\/vpcs$/);
    await expect(page.getByText("VPCs could not be loaded")).toHaveCount(0);

    const cookies = await page.context().cookies();
    const session = cookies.find((c) => c.name === "vws_session");
    const csrf = cookies.find((c) => c.name === "vws_csrf");
    expect(session?.httpOnly).toBe(true);
    expect(csrf?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe("Lax");
    // Neither the session nor the CSRF token is readable by page scripts.
    expect(await page.evaluate(() => document.cookie)).toBe("");
  });

  test("an expired or revoked session goes to the login screen on 401", async ({ page, context, baseURL }) => {
    await context.addCookies([
      { name: "vws_session", value: "revoked", url: baseURL! },
      { name: "vws_csrf", value: "revoked", url: baseURL! },
    ]);
    await page.goto("/storage/volumes");
    await expect(page).toHaveURL(/\/login\?reason=expired&next=%2Fstorage%2Fvolumes$/);
    await expect(page.getByRole("status")).toContainText("Your session ended");
  });

  test("rejects an open redirect after sign-in", async ({ page }) => {
    await page.goto("/login?next=//evil.example");
    await signIn(page, process.env.E2E_ROOT_PASSWORD!);
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/compute\/instances$/);
  });
});

test("writes carry the CSRF token: the console creates a VPC, a cookie write without the token is refused", async ({ page, context }) => {
  await page.goto("/network/vpcs");
  await page.getByRole("button", { name: "Create VPC" }).first().click();
  await page.getByRole("dialog").getByLabel("IPv4 CIDR").fill("10.77.0.0/16");
  await page.getByRole("dialog").getByRole("button", { name: "Create VPC" }).click();
  await expect(page.getByRole("row").filter({ hasText: "10.77.0.0/16" })).toHaveCount(1);

  const session = (await context.cookies()).find((c) => c.name === "vws_session")!.value;
  const csrf = (await context.cookies()).find((c) => c.name === "vws_csrf")!.value;
  const api = process.env.E2E_API_URL!;
  const write = (headers: Record<string, string>) =>
    fetch(`${api}/api/v1/vpcs`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID(), cookie: `vws_session=${session}; vws_csrf=${csrf}`, ...headers },
      body: JSON.stringify({ cidrBlock: "10.78.0.0/16" }),
    });
  expect((await write({})).status).toBe(403);
  expect((await write({ "x-csrf-token": "wrong" })).status).toBe(403);
  expect((await write({ "x-csrf-token": csrf })).status).toBe(202);
});

test("sign out revokes the session and returns to the login screen", async ({ page, context }) => {
  // Sign in fresh so signing out does not revoke the shared session the other specs use.
  await context.clearCookies();
  await page.goto("/login");
  await signIn(page, process.env.E2E_ROOT_PASSWORD!);
  await expect(page).toHaveURL(/\/compute\/instances/);
  const session = (await context.cookies()).find((c) => c.name === "vws_session")!.value;

  await page.getByRole("button", { name: /demo\.operator/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.cookies()).filter((c) => c.name.startsWith("vws_"))).toEqual([]);

  const after = await fetch(`${process.env.E2E_API_URL}/api/v1/auth/session`, { headers: { cookie: `vws_session=${session}` } });
  expect(after.status).toBe(401);
  await page.goto("/compute/instances");
  await expect(page).toHaveURL(/\/login\?next=/);
});
