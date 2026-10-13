import { describe, expect, it } from "vitest";
import { blocksNextStep, reachableSteps, summaryReady, validateStorage } from "@/lib/installer/contract";

describe("validateStorage", () => {
  it("requires NFS server and an absolute export path", () => {
    expect(validateStorage({ driver: "nfs", nfs: { server: "", share: "exports" } }, []).map((e) => [e.field, e.code])).toEqual([
      ["spec.storage.nfs.server", "required"],
      ["spec.storage.nfs.share", "invalid"],
    ]);
  });
  it("accepts a host name or IP with an absolute path", () => {
    expect(validateStorage({ driver: "nfs", nfs: { server: "nas.example.internal", share: "/exports/vws" } }, [])).toEqual([]);
    expect(validateStorage({ driver: "nfs", nfs: { server: "192.0.2.10", share: "/v" } }, [])).toEqual([]);
    expect(validateStorage({ driver: "nfs", nfs: { server: "999.1.1.1", share: "/v" } }, [])[0]?.code).toBe("invalid");
  });
  it("requires an existing StorageClass for generic CSI", () => {
    expect(validateStorage({ driver: "existing", storageClass: "" }, ["a"])[0]?.code).toBe("required");
    expect(validateStorage({ driver: "existing", storageClass: "b" }, ["a"])[0]?.code).toBe("not_found");
    expect(validateStorage({ driver: "existing", storageClass: "a", volumeMode: "Filesystem" }, ["a"])).toEqual([]);
  });
  it("has no client rules for rook-ceph", () => {
    expect(validateStorage({ driver: "rook-ceph" }, [])).toEqual([]);
  });
});

describe("step gating", () => {
  const all = { roles: "valid", network: "valid", storage: "invalid", eip: "pending", profile: "pending", observability: "pending" } as const;
  it("stops at the first step that is not valid", () => {
    expect(reachableSteps(all)).toEqual(["roles", "network", "storage"]);
    expect(summaryReady(all)).toBe(false);
  });
  it("opens the summary only when every step is valid", () => {
    const ok = { roles: "valid", network: "valid", storage: "valid", eip: "valid", profile: "valid", observability: "valid" } as const;
    expect(summaryReady(ok)).toBe(true);
  });
  it("blocks only on failed error checks", () => {
    const check = { id: "x", message: "m" };
    expect(blocksNextStep({ ranAt: "", checks: [{ ...check, severity: "warning", status: "fail" }, { ...check, severity: "error", status: "unknown" }] })).toBe(false);
    expect(blocksNextStep({ ranAt: "", checks: [{ ...check, severity: "error", status: "fail" }] })).toBe(true);
    expect(blocksNextStep(null)).toBe(false);
  });
});
