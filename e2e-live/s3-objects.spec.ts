import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const api = `http://127.0.0.1:${Number(process.env.E2E_EC2_PORT ?? 48081) - 1}/api/v1`;
const content = Buffer.from(Uint8Array.from({ length: 256 }, (_, index) => index));
const MAX_OBJECT_BYTES = 4 * 1024 * 1024;

const field = (page: Page, label: string) =>
  page.locator(`xpath=//dt[normalize-space()="${label}"]/following-sibling::dd`);

test("uploads with per-file status, opens the object, downloads the same bytes and deletes it", async ({
  page,
  request,
}) => {
  const bucket = `e2e-objects-${Date.now().toString(36)}`;
  const key = "docs/data.bin";
  const objectPage = `/storage/buckets/${bucket}/object?prefix=${encodeURIComponent(key)}`;
  const downloadUrl = `/storage/buckets/${bucket}/object/download?prefix=${encodeURIComponent(key)}`;

  try {
    await page.goto("/storage/buckets/create");
    await page.getByPlaceholder("my-bucket").fill(bucket);
    await page.getByRole("button", { name: "Create bucket" }).click();
    await expect(page).toHaveURL(new RegExp(`/storage/buckets/${bucket}$`));

    await page.goto(`/storage/buckets/${bucket}/upload?prefix=${encodeURIComponent("docs/")}`);
    await page.getByLabel("Add files").setInputFiles([
      { name: "data.bin", mimeType: "application/octet-stream", buffer: content },
      { name: "too-big.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(MAX_OBJECT_BYTES + 1) },
    ]);
    await expect(page.getByRole("row").filter({ hasText: "data.bin" })).toContainText("Pending");
    await expect(page.getByRole("row").filter({ hasText: "too-big.bin" })).toContainText("Failed");
    await page.getByRole("button", { name: "Upload", exact: true }).click();

    await expect(page.getByRole("status").first()).toHaveText("Upload failed");
    await expect(page.getByText("Upload: status")).toBeVisible();
    await expect(field(page, "Succeeded")).toHaveText("1");
    await expect(field(page, "Failed")).toHaveText("1");
    await expect(page.getByRole("row").filter({ hasText: "data.bin" })).toContainText("Succeeded");
    await expect(page.getByRole("row").filter({ hasText: "too-big.bin" })).toContainText(
      "Objects larger than 4 MiB cannot be uploaded.",
    );
    await expect(page).toHaveURL(/\/upload\?prefix=docs%2F$/);
    await expect(page.getByRole("button", { name: "Retry" })).toBeDisabled();

    await page.getByRole("link", { name: "data.bin" }).click();
    await expect(page).toHaveURL(new RegExp(`/storage/buckets/${bucket}/object\\?prefix=docs%2Fdata\\.bin$`));
    await expect(page.getByRole("heading", { name: "Object overview" })).toBeVisible();
    const expectOverview = async () => {
      await expect(field(page, "Key")).toHaveText(key);
      await expect(field(page, "Size")).toHaveText("256 B");
      await expect(field(page, "Type")).toHaveText("bin");
      await expect(field(page, "S3 URI")).toHaveText(`s3://${bucket}/${key}`);
      await expect(field(page, "Amazon Resource Name (ARN)")).toHaveText(`arn:aws:s3:::${bucket}/${key}`);
      await expect(field(page, "AWS Region")).toHaveText("vws-1");
      await expect(field(page, "Owner")).toHaveText("123456789012");
      await expect(field(page, "Object URL")).toHaveText(downloadUrl);
      await expect(field(page, "Entity tag (Etag)")).not.toHaveText("—");
    };
    await expectOverview();

    const saved = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    const file = await saved;
    expect(file.suggestedFilename()).toBe("data.bin");
    expect(await readFile((await file.path())!)).toEqual(content);

    await page.reload();
    await expectOverview();

    const raw = await page.request.get(downloadUrl);
    expect(raw.status()).toBe(200);
    expect(raw.headers()["content-type"]).toBe("application/octet-stream");
    expect(raw.headers()["content-disposition"]).toBe(`attachment; filename="data.bin"; filename*=UTF-8''data.bin`);
    expect(raw.headers()["x-content-type-options"]).toBe("nosniff");
    expect(raw.headers()["cache-control"]).toBe("private, no-store");
    expect(await raw.body()).toEqual(content);

    const missing = await page.request.get(`/storage/buckets/${bucket}/object/download`);
    expect(missing.status()).toBe(400);
    expect((await missing.json()).error.code).toBe("InvalidArgument");
    const traversal = await page.request.get(
      `/storage/buckets/${bucket}/object/download?prefix=${encodeURIComponent("a/../b")}`,
    );
    expect(traversal.status()).toBe(400);

    await page.getByRole("button", { name: /Object actions/ }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("dialog").getByLabel("Confirm deletion").fill("permanently delete");
    await page.getByRole("dialog").getByRole("button", { name: "Delete objects" }).click();
    await expect(page).toHaveURL(new RegExp(`/storage/buckets/${bucket}$`));

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/storage/buckets/${bucket}/object\\?prefix=docs%2Fdata\\.bin$`));
    await expect(page.getByText("Object not found")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Object overview" })).toHaveCount(0);

    await page.goto(objectPage);
    await expect(page.getByText("Object not found")).toBeVisible();
    await expect(page.getByText(`${key} is not in ${bucket}.`)).toBeVisible();

    const gone = await page.request.get(downloadUrl);
    expect(gone.status()).toBe(404);
    expect(gone.headers()["content-type"]).toBe("application/json");
    expect((await gone.json()).error.code).toBe("NoSuchKey");
  } finally {
    await request.delete(`${api}/buckets/${bucket}`, { headers: { authorization: "Bearer dev-token" } });
  }
});

test("opens and downloads an object at the 4 MiB upload limit", async ({ page, request }) => {
  const bucket = `e2e-max-${Date.now().toString(36)}`;
  const largest = Buffer.from(Uint8Array.from({ length: MAX_OBJECT_BYTES }, (_, index) => index % 251));
  const headers = { authorization: "Bearer dev-token" };
  try {
    expect((await request.put(`${api}/buckets/${bucket}`, { headers })).ok()).toBe(true);
    await page.goto(`/storage/buckets/${bucket}/upload`);
    const row = page.getByRole("row").filter({ hasText: "max.bin" });
    await expect(async () => {
      await page
        .getByLabel("Add files")
        .setInputFiles([{ name: "max.bin", mimeType: "application/octet-stream", buffer: largest }]);
      await expect(row).toContainText("Pending", { timeout: 1_000 });
    }).toPass();
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(row).toContainText("Succeeded");

    await page.getByRole("link", { name: "max.bin" }).click();
    await expect(page.getByRole("heading", { name: "Object overview" })).toBeVisible();
    await expect(field(page, "Size")).toHaveText("4.0 MB");
    const saved = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    expect((await readFile((await (await saved).path())!)).equals(largest)).toBe(true);
  } finally {
    await request.delete(`${api}/buckets/${bucket}/objects/max.bin`, { headers });
    await request.delete(`${api}/buckets/${bucket}`, { headers });
  }
});

test("sends a download request without a session to the sign-in page, not the object", async ({
  playwright,
  baseURL,
}) => {
  const anonymous = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const reply = await anonymous.get("/storage/buckets/any-bucket/object/download?prefix=a.txt", { maxRedirects: 0 });
    expect(reply.status()).toBe(307);
    expect(new URL(reply.headers().location, baseURL).pathname).toBe("/login");
  } finally {
    await anonymous.dispose();
  }
});
