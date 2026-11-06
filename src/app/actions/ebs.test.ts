import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  createVolume: vi.fn(),
  createSnapshot: vi.fn(),
  deleteVolume: vi.fn(),
  deleteSnapshot: vi.fn(),
  detachVolume: vi.fn(),
}));
vi.mock("@/lib/vws-api/client", () => api);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createSnapshotAction,
  createVolumeAction,
  deleteSnapshotsAction,
  deleteVolumesAction,
  detachVolumeAction,
} from "@/app/actions/resources";

const KEY = "0b6f9c64-6c55-4c55-9b7f-1f7d2a1c0e11";
const volume = {
  volumeType: "gp3",
  size: 9,
  iops: 3000,
  throughput: 125,
  availabilityZone: "vws-1a",
  snapshotId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(api)) fn.mockResolvedValue({ ok: true, value: undefined });
});

describe("createVolumeAction", () => {
  it("sends the parsed volume with the caller's idempotency key", async () => {
    expect(await createVolumeAction(volume, KEY)).toBeNull();
    expect(api.createVolume).toHaveBeenCalledWith(volume, KEY);
  });

  it("sends the same key again on a resend so console-api makes one volume", async () => {
    await createVolumeAction(volume, KEY);
    await createVolumeAction(volume, KEY);
    expect(api.createVolume.mock.calls.map((call) => call[1])).toEqual([KEY, KEY]);
  });

  it("refuses hostile input on the server without calling the API", async () => {
    expect(await createVolumeAction({ ...volume, size: -1 }, KEY)).toMatchObject({ code: "InvalidParameterValue" });
    expect(await createVolumeAction({ ...volume, volumeType: "__proto__" }, KEY)).toMatchObject({
      code: "InvalidParameterValue",
    });
    expect(await createVolumeAction(volume, "bad key\n")).toMatchObject({ code: "InvalidArgument" });
    expect(await createVolumeAction(volume, undefined)).toMatchObject({ code: "InvalidArgument" });
    expect(api.createVolume).not.toHaveBeenCalled();
  });

  it("returns the API error", async () => {
    api.createVolume.mockResolvedValue({
      ok: false,
      error: { code: "VolumeLimitExceeded", message: "x", requestId: "r" },
    });
    expect(await createVolumeAction(volume, KEY)).toMatchObject({ code: "VolumeLimitExceeded", requestId: "r" });
  });
});

describe("createSnapshotAction", () => {
  it("sends the parsed snapshot with the key", async () => {
    const input = { volumeId: "vol-0123456789abcdef0", description: "nightly" };
    expect(await createSnapshotAction(input, KEY)).toBeNull();
    expect(api.createSnapshot).toHaveBeenCalledWith(input, KEY);
  });

  it("refuses a description over 255 characters", async () => {
    const input = { volumeId: "vol-0123456789abcdef0", description: "d".repeat(256) };
    expect(await createSnapshotAction(input, KEY)).toMatchObject({ code: "InvalidParameterValue" });
    expect(api.createSnapshot).not.toHaveBeenCalled();
  });
});

describe("delete actions", () => {
  it("refuses an ID that is not a volume or snapshot ID", async () => {
    expect(await deleteVolumesAction(["vol-0123456789abcdef0", "../x"])).toMatchObject({
      code: "InvalidParameterValue",
    });
    expect(await deleteSnapshotsAction("snap-0123456789abcdef0")).toMatchObject({ code: "InvalidParameterValue" });
    expect(api.deleteVolume).not.toHaveBeenCalled();
    expect(api.deleteSnapshot).not.toHaveBeenCalled();
  });

  it("deletes each ID and stops at the first failure", async () => {
    api.deleteVolume
      .mockResolvedValueOnce({ ok: true, value: undefined })
      .mockResolvedValueOnce({ ok: false, error: { code: "VolumeInUse", message: "in use", requestId: "r" } });
    const ids = ["vol-0123456789abcdef0", "vol-0123456789abcdef1", "vol-0123456789abcdef2"];
    expect(await deleteVolumesAction(ids)).toMatchObject({ code: "VolumeInUse" });
    expect(api.deleteVolume).toHaveBeenCalledTimes(2);
  });

  it("counts a volume or snapshot that is already gone as deleted, so a second Delete succeeds", async () => {
    const gone = { ok: false, error: { code: "NotFound", message: "does not exist", requestId: "r" } };
    api.deleteVolume.mockResolvedValueOnce(gone).mockResolvedValueOnce({ ok: true, value: undefined });
    expect(await deleteVolumesAction(["vol-0123456789abcdef0", "vol-0123456789abcdef1"])).toBeNull();
    expect(api.deleteVolume).toHaveBeenCalledTimes(2);
    api.deleteSnapshot.mockResolvedValueOnce(gone);
    expect(await deleteSnapshotsAction(["snap-0123456789abcdef0"])).toBeNull();
  });
});

describe("detachVolumeAction", () => {
  it("detaches without force unless force is true", async () => {
    expect(await detachVolumeAction("vol-0123456789abcdef0")).toBeNull();
    expect(await detachVolumeAction("vol-0123456789abcdef0", true)).toBeNull();
    expect(api.detachVolume.mock.calls).toEqual([
      ["vol-0123456789abcdef0", false],
      ["vol-0123456789abcdef0", true],
    ]);
  });

  it.each([["true"], [1], [null], [{}]])("refuses the force value %j without calling the API", async (force) => {
    expect(await detachVolumeAction("vol-0123456789abcdef0", force as unknown as boolean)).toMatchObject({
      code: "InvalidParameterValue",
    });
    expect(api.detachVolume).not.toHaveBeenCalled();
  });
});
