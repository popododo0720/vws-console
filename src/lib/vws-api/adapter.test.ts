import { describe, expect, it } from "vitest";
import {
  nextPageToken,
  parseApiError,
  parseImages,
  parseInstances,
  parseOperation,
  parseSubnets,
  parseVolumes,
  parseVpcs,
  parseInstanceTypes,
} from "./adapter";

const instance = {
  instanceId: "i-72a10f87b54bdd869",
  reservationId: "r-60505a7c913819789",
  ownerId: "123456789012",
  state: "running",
  imageId: "ami-0123456789abcdef0",
  instanceType: "vws.small",
  subnetId: "subnet-27c341ab7a6719423",
  vpcId: "vpc-9",
  availabilityZone: "vws-1a",
  launchTime: "2026-10-14T06:00:32Z",
  privateIpAddress: "10.0.0.2",
  tags: { Name: "web" },
};

describe("console-api adapter", () => {
  it("maps an instance and takes the name from tags.Name", () => {
    const [row] = parseInstances({ items: [instance] });
    expect(row).toMatchObject({
      id: "i-72a10f87b54bdd869",
      name: "web",
      state: "running",
      type: "vws.small",
      availabilityZone: "vws-1a",
      privateIpv4: "10.0.0.2",
      subnetId: "subnet-27c341ab7a6719423",
      imageId: "ami-0123456789abcdef0",
      region: "vws-1",
      vpcId: "vpc-9",
      launchedAt: "2026-10-14T06:00:32Z",
      publicIpv4: "",
      status: "none",
    });
  });

  it("accepts shutting-down and terminated and leaves a missing name and IP empty", () => {
    const rows = parseInstances({
      items: [
        { ...instance, state: "shutting-down", tags: undefined, privateIpAddress: undefined },
        { ...instance, state: "terminated" },
      ],
    });
    expect(rows.map((row) => [row.state, row.name, row.privateIpv4])).toEqual([
      ["shutting-down", "", ""],
      ["terminated", "web", "10.0.0.2"],
    ]);
  });

  it("rejects an instance state it does not know", () => {
    expect(() => parseInstances({ items: [{ ...instance, state: "rebooting" }] })).toThrow("unknown instance state rebooting");
  });

  it("rejects a page without items", () => {
    expect(() => parseVpcs({ vpcs: [] })).toThrow("expected items");
    expect(() => parseVpcs({ items: null })).toThrow("expected items");
    expect(parseVpcs({ items: [] })).toEqual([]);
  });

  it("maps volumes and treats an empty instanceId as unattached", () => {
    const rows = parseVolumes({
      items: [
        { volumeId: "vol-1", ownerId: "123456789012", size: 8, availabilityZone: "vws-1a", volumeType: "gp3", state: "available", instanceId: "", createTime: "2026-10-14T05:30:19Z" },
        { volumeId: "vol-2", ownerId: "123456789012", size: 20, availabilityZone: "vws-1a", volumeType: "gp2", state: "in-use", instanceId: "i-1", snapshotId: "snap-1", createTime: "2026-10-14T05:31:00Z" },
      ],
    });
    expect(rows.map((v) => [v.id, v.state, v.sizeGiB, v.volumeType, v.attachedTo, v.snapshotId, v.owner, v.iops, v.name])).toEqual([
      ["vol-1", "available", 8, "gp3", "", "", "123456789012", null, ""],
      ["vol-2", "in-use", 20, "gp2", "i-1", "snap-1", "123456789012", null, ""],
    ]);
  });

  it("maps VPCs and subnets, leaving fields the API lacks empty", () => {
    const [vpc, older] = parseVpcs({
      items: [
        { vpcId: "vpc-1", ownerId: "123456789012", cidrBlock: "10.0.0.0/16", state: "available", isDefault: false },
        { vpcId: "vpc-2", cidrBlock: "10.1.0.0/16", state: "available" },
      ],
    });
    expect([vpc.id, vpc.state, vpc.ipv4Cidr, vpc.owner, vpc.isDefault, vpc.blockPublicAccess, vpc.name]).toEqual([
      "vpc-1", "available", "10.0.0.0/16", "123456789012", false, "", "",
    ]);
    expect(older.isDefault).toBeNull();
    const [subnet] = parseSubnets({
      items: [{ subnetId: "subnet-1", ownerId: "123456789012", vpcId: "vpc-1", cidrBlock: "10.0.1.0/24", state: "pending", availabilityZone: "vws-1a", mapPublicIpOnLaunch: true }],
    });
    expect([subnet.id, subnet.vpcId, subnet.ipv4Cidr, subnet.state, subnet.availabilityZone, subnet.autoAssignPublicIp, subnet.availableIps]).toEqual([
      "subnet-1", "vpc-1", "10.0.1.0/24", "pending", "vws-1a", true, null,
    ]);
  });

  it("maps instance types from the catalog", () => {
    expect(parseInstanceTypes({ items: [{ instanceType: "vws.medium", vcpus: 2, memoryMiB: 4096 }] })).toEqual([{ id: "vws.medium", vcpus: 2, memoryMiB: 4096 }]);
  });

  it("reads the error envelope and the page token", () => {
    expect(parseApiError({ error: { code: "Conflict", kind: "vpc", id: "vpc-1", message: "vpc has dependents" }, requestId: "33e6e2d8794777e5" })).toEqual({
      code: "Conflict",
      message: "vpc has dependents",
      requestId: "33e6e2d8794777e5",
    });
    expect(parseApiError({ items: [] })).toBeNull();
    expect(nextPageToken({ items: [], nextPageToken: "p2" })).toBe("p2");
    expect(nextPageToken({ items: [] })).toBe("");
  });

  it("reads operation states and a failure", () => {
    expect(parseOperation({ id: "op-1", state: "running" })).toEqual({ id: "op-1", state: "running", error: null });
    expect(parseOperation({ id: "op-2", state: "failed", error: { code: "Conflict", message: "busy" } })).toEqual({
      id: "op-2",
      state: "failed",
      error: { code: "Conflict", message: "busy", requestId: null },
    });
    expect(() => parseOperation({ id: "op-3", state: "queued" })).toThrow("unknown operation state queued");
  });

  it("maps images", () => {
    expect(parseImages({ items: [{ imageId: "ami-0123456789abcdef0", ownerId: "123456789012", name: "vws-1", state: "available" }] })).toEqual([
      { id: "ami-0123456789abcdef0", name: "vws-1", state: "available", owner: "123456789012" },
    ]);
  });
});
