import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ObjectDetailProps } from "@/components/sites/console/object-detail-view";
import { parseBucketName, type ApiError } from "@/lib/vws-api/adapter";
import Page from "./page";

const api = vi.hoisted(() => ({ getBucket: vi.fn(), getObjectMeta: vi.fn() }));
vi.mock("@/lib/vws-api/client", () => api);
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/components/sites/console/object-detail-view", () => ({ ObjectDetailView: () => null }));

const name = parseBucketName("logs-1");
if (!name) throw new Error("logs-1");
const bucket = { name, ownerId: "123", created: "2026-08-02T00:00:00Z" };
const stored = { bucket: name, key: "a b.txt", size: 1, contentType: "", lastModified: "", etag: "e" };
const failure: ApiError = { code: "ServiceUnavailable", message: "down", requestId: "r-1" };

async function render(rawName: string, prefix?: string | string[]): Promise<ObjectDetailProps> {
  const element = await Page({
    params: Promise.resolve({ name: rawName }),
    searchParams: Promise.resolve(prefix === undefined ? {} : { prefix }),
  });
  const suspense = element as ReactElement<{ children: ReactElement<ObjectDetailProps> }>;
  return suspense.props.children.props;
}

describe("object page", () => {
  beforeEach(() => {
    api.getBucket.mockReset();
    api.getObjectMeta.mockReset();
    api.getBucket.mockResolvedValue({ ok: true, value: bucket });
    api.getObjectMeta.mockResolvedValue({ ok: true, value: stored });
  });

  it("loads the bucket and the object for a valid key", async () => {
    const props = await render("logs-1", "a b.txt");
    expect(props).toEqual({ name: "logs-1", objectKey: "a b.txt", bucket, object: stored, loadError: null });
    expect(api.getObjectMeta).toHaveBeenCalledWith("logs-1", "a b.txt");
  });

  it("passes a missing key through as no object", async () => {
    api.getObjectMeta.mockResolvedValue({ ok: true, value: null });
    expect(await render("logs-1", "gone.txt")).toMatchObject({ bucket, object: null, loadError: null });
  });

  it("reports a missing bucket without showing the object", async () => {
    api.getBucket.mockResolvedValue({ ok: true, value: null });
    expect(await render("logs-1", "a")).toMatchObject({ bucket: null, object: null, loadError: null });
  });

  it("reports API failures as load errors", async () => {
    api.getBucket.mockResolvedValue({ ok: false, error: failure });
    expect(await render("logs-1", "a")).toMatchObject({ bucket: null, loadError: failure });
    api.getBucket.mockResolvedValue({ ok: true, value: bucket });
    api.getObjectMeta.mockResolvedValue({ ok: false, error: failure });
    expect(await render("logs-1", "a")).toMatchObject({ bucket, object: null, loadError: failure });
  });

  it("calls no API for a bad prefix and shows a validation error", async () => {
    for (const prefix of [undefined, ["a", "b"], "", "/abs", "a/../b"]) {
      const props = await render("logs-1", prefix);
      expect(props.loadError).toMatchObject({ code: "InvalidArgument" });
      expect(props.object).toBeNull();
    }
    expect(api.getBucket).not.toHaveBeenCalled();
    expect(api.getObjectMeta).not.toHaveBeenCalled();
  });

  it("treats a bad bucket segment as a missing bucket without calling the API", async () => {
    for (const raw of ["Bad_Name", "%E0%A4%A", "a%2Fb"]) {
      expect(await render(raw, "a")).toMatchObject({ bucket: null, object: null, loadError: null });
    }
    expect(api.getBucket).not.toHaveBeenCalled();
  });
});
