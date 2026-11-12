import type { ComponentProps, ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InstanceConnectView } from "@/components/sites/console/instance-connect-view";
import type { ApiError } from "@/lib/vws-api/adapter";
import Page from "./page";

const api = vi.hoisted(() => ({ getInstance: vi.fn() }));
vi.mock("@/lib/vws-api/client", () => api);
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/components/sites/console/instance-connect-view", () => ({ InstanceConnectView: () => null }));

type Props = ComponentProps<typeof InstanceConnectView>;
const ID = "i-0123456789abcdef0";
const failure: ApiError = { code: "ServiceUnavailable", message: "down", requestId: "r-1" };

async function render(id: string): Promise<Props> {
  const element = await Page({ params: Promise.resolve({ id }) });
  return (element as ReactElement<Props>).props;
}

describe("Connect to instance page", () => {
  beforeEach(() => {
    api.getInstance.mockReset();
  });

  it("loads the instance of a valid ID", async () => {
    const instance = { id: ID, name: "web" };
    api.getInstance.mockResolvedValue({ ok: true, value: instance });
    expect(await render(ID)).toEqual({ id: ID, instance, loadError: null });
    expect(api.getInstance).toHaveBeenCalledExactlyOnceWith(ID);
  });

  it("passes a missing instance and an API failure on", async () => {
    api.getInstance.mockResolvedValue({ ok: true, value: null });
    expect(await render(ID)).toEqual({ id: ID, instance: null, loadError: null });
    api.getInstance.mockResolvedValue({ ok: false, error: failure });
    expect(await render(ID)).toEqual({ id: ID, instance: null, loadError: failure });
  });

  it.each(["not-an-id", "I-0123456789ABCDEF0", `${ID}%2F..`, `${ID}?kind=serial`])(
    "calls no API for %j and shows a validation error",
    async (id) => {
      expect(await render(id)).toMatchObject({ id, instance: null, loadError: { code: "InvalidParameterValue" } });
      expect(api.getInstance).not.toHaveBeenCalled();
    },
  );
});
