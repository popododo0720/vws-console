import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ rebootInstance: vi.fn() }));
vi.mock("@/lib/vws-api/client", () => api);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { rebootInstancesAction } from "@/app/actions/resources";

const done = { ok: true, value: undefined };
const refused = { code: "Conflict", message: "instance cannot be rebooted from stopped", requestId: "r-1" };

beforeEach(() => {
  vi.clearAllMocks();
  api.rebootInstance.mockResolvedValue(done);
});

describe("rebootInstancesAction", () => {
  it("reboots each instance in order and stops at the first failure", async () => {
    api.rebootInstance.mockResolvedValueOnce(done).mockResolvedValueOnce({ ok: false, error: refused });
    expect(await rebootInstancesAction(["i-0000000a", "i-0000000b", "i-0000000c"])).toEqual(refused);
    expect(api.rebootInstance.mock.calls).toEqual([["i-0000000a"], ["i-0000000b"]]);
  });

  it("takes the shortest and the longest instance ID console-api issues", async () => {
    expect(await rebootInstancesAction(["i-01234567", "i-0123456789abcdef0"])).toBeNull();
    expect(api.rebootInstance).toHaveBeenCalledTimes(2);
  });

  it.each([[[]], [["i-0123456"]], [["i-0123456789abcdef01"]], [["i-0000000a", "../admin"]], ["i-0000000a"], [null]])(
    "refuses %j on the server without calling the API",
    async (ids) => {
      expect(await rebootInstancesAction(ids)).toMatchObject({ code: "InvalidParameterValue" });
      expect(api.rebootInstance).not.toHaveBeenCalled();
    },
  );
});
