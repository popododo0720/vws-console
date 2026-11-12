import { expect, test, type Page } from "@playwright/test";

// The fake console-api (fake-console-api.mts) lists a read-only Proxmox region, an AWS region and a region whose
// capability read fails. Each case runs at a desktop and a phone width.
const signIn = (page: Page, baseURL: string | undefined) =>
  page.context().addCookies(["vws_session", "vws_csrf"].map((name) => ({ name, value: "alice", url: baseURL })));

for (const width of [1440, 390]) {
  test.describe(`capability-gated actions at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("a read-only region disables its actions and explains why; an AWS region keeps them", async ({
      page,
      baseURL,
    }) => {
      await signIn(page, baseURL);
      await page.goto("/storage/volumes?region=pve-lab-1");
      const create = page.getByRole("button", { name: "Create volume" });
      await expect(create).toBeDisabled();
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await create.locator("xpath=..").hover();
      await expect(page.getByRole("tooltip")).toHaveText("read-only");
      await expect(page.getByRole("tooltip")).toBeInViewport({ ratio: 1 });
      await page.goto("/storage/volumes?region=ap-northeast-2");
      await expect(page.getByRole("link", { name: "Create volume" })).toHaveAttribute(
        "href",
        "/storage/volumes/create",
      );
    });

    test("a failed capability read shows its error and disables the actions", async ({ page, baseURL }) => {
      await signIn(page, baseURL);
      await page.goto("/storage/volumes?region=pve-down-1");
      await expect(page.getByRole("alert").filter({ hasText: "capabilities" })).toContainText(
        "Unavailable · Request ID",
      );
      await expect(page.getByRole("button", { name: "Create volume" })).toBeDisabled();
    });
  });
}
