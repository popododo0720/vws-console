import { describe, expect, it } from "vitest";
import {
  nextPageToken,
  parseAccountBuckets,
  parseApiError,
  parseBucketName,
  parseStoredBucketName,
  parseImages,
  parseInstances,
  parseOperation,
  parseSubnets,
  parseVolumes,
  parseVpcs,
  parseAddresses,
  parseInstanceTypes,
  parseSecurityGroups,
  parseSnapshots,
  toAccountBucket,
  toIngressPermission,
  identityFromSession,
} from "./adapter";
import { makeRule } from "@/lib/security-group-rules";

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
    expect(() => parseInstances({ items: [{ ...instance, state: "rebooting" }] })).toThrow(
      "unknown instance state rebooting",
    );
  });

  it("rejects a page without items", () => {
    expect(() => parseVpcs({ vpcs: [] })).toThrow("expected items");
    expect(() => parseVpcs({ items: null })).toThrow("expected items");
    expect(parseVpcs({ items: [] })).toEqual([]);
  });

  it("maps volumes and treats an empty instanceId as unattached", () => {
    const rows = parseVolumes({
      items: [
        {
          volumeId: "vol-1",
          ownerId: "123456789012",
          size: 8,
          availabilityZone: "vws-1a",
          volumeType: "gp3",
          state: "available",
          instanceId: "",
          createTime: "2026-10-14T05:30:19Z",
        },
        {
          volumeId: "vol-2",
          ownerId: "123456789012",
          size: 20,
          availabilityZone: "vws-1a",
          volumeType: "gp2",
          state: "in-use",
          instanceId: "i-1",
          snapshotId: "snap-1",
          createTime: "2026-10-14T05:31:00Z",
        },
        {
          volumeId: "vol-3",
          ownerId: "123456789012",
          size: 10,
          availabilityZone: "vws-1a",
          volumeType: "gp3",
          state: "in-use",
          instanceId: "i-2",
          device: "/dev/sdf",
          createTime: "2026-10-14T05:32:00Z",
        },
      ],
    });
    expect(
      rows.map((v) => [v.id, v.state, v.sizeGiB, v.volumeType, v.attachment, v.snapshotId, v.owner, v.iops, v.name]),
    ).toEqual([
      ["vol-1", "available", 8, "gp3", null, "", "123456789012", null, ""],
      ["vol-2", "in-use", 20, "gp2", { instanceId: "i-1", device: "" }, "snap-1", "123456789012", null, ""],
      ["vol-3", "in-use", 10, "gp3", { instanceId: "i-2", device: "/dev/sdf" }, "", "123456789012", null, ""],
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
      "vpc-1",
      "available",
      "10.0.0.0/16",
      "123456789012",
      false,
      "",
      "",
    ]);
    expect(older.isDefault).toBeNull();
    const [subnet] = parseSubnets({
      items: [
        {
          subnetId: "subnet-1",
          ownerId: "123456789012",
          vpcId: "vpc-1",
          cidrBlock: "10.0.1.0/24",
          state: "pending",
          availabilityZone: "vws-1a",
          mapPublicIpOnLaunch: true,
        },
      ],
    });
    expect([
      subnet.id,
      subnet.vpcId,
      subnet.ipv4Cidr,
      subnet.state,
      subnet.availabilityZone,
      subnet.autoAssignPublicIp,
      subnet.availableIps,
    ]).toEqual(["subnet-1", "vpc-1", "10.0.1.0/24", "pending", "vws-1a", true, null]);
  });

  it("maps instance types from the catalog", () => {
    expect(parseInstanceTypes({ items: [{ instanceType: "vws.medium", vcpus: 2, memoryMiB: 4096 }] })).toEqual([
      { id: "vws.medium", vcpus: 2, memoryMiB: 4096 },
    ]);
  });

  it("reads the error envelope and the page token", () => {
    expect(
      parseApiError({
        error: { code: "Conflict", kind: "vpc", id: "vpc-1", message: "vpc has dependents" },
        requestId: "33e6e2d8794777e5",
      }),
    ).toEqual({
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

  it("maps security groups and their ingress rules, leaving what the API lacks empty", () => {
    const [group] = parseSecurityGroups({
      items: [
        {
          groupId: "sg-1",
          ownerId: "123456789012",
          groupName: "web",
          vpcId: "vpc-1",
          ipPermissions: [
            { ipProtocol: "tcp", fromPort: 22, toPort: 22, cidrIp: "0.0.0.0/0" },
            { ipProtocol: "udp", fromPort: 1000, toPort: 2000, cidrIp: "10.0.0.0/8" },
            { ipProtocol: "-1", fromPort: 0, toPort: 0, cidrIp: "10.0.0.0/8" },
            { ipProtocol: "icmp", fromPort: 0, toPort: 0, cidrIp: "0.0.0.0/0" },
          ],
        },
      ],
    });
    expect(group).toMatchObject({
      id: "sg-1",
      groupName: "web",
      vpcId: "vpc-1",
      owner: "123456789012",
      description: "",
      name: "",
    });
    expect(group.rules.map((rule) => [rule.id, rule.direction, rule.protocol, rule.port, rule.source])).toEqual([
      ["", "in", "TCP", "22", "0.0.0.0/0"],
      ["", "in", "UDP", "1000-2000", "10.0.0.0/8"],
      ["", "in", "All", "All", "10.0.0.0/8"],
      ["", "in", "ICMP", "All", "0.0.0.0/0"],
    ]);
    expect(parseSecurityGroups({ items: [{ groupId: "sg-2" }] })[0].rules).toEqual([]);
  });

  it("turns console rules into authorize-ingress bodies and refuses what the API cannot take", () => {
    expect(toIngressPermission(makeRule("in", "TCP", "8000-8080", "10.0.0.0/16"))).toEqual({
      ok: true,
      value: { ipProtocol: "tcp", fromPort: 8000, toPort: 8080, cidrIp: "10.0.0.0/16" },
    });
    expect(toIngressPermission(makeRule("in", "All", "All", "0.0.0.0/0"))).toEqual({
      ok: true,
      value: { ipProtocol: "-1", fromPort: 0, toPort: 0, cidrIp: "0.0.0.0/0" },
    });
    expect(toIngressPermission(makeRule("in", "ICMP", "All", "0.0.0.0/0"))).toMatchObject({
      value: { ipProtocol: "icmp", fromPort: 0, toPort: 0 },
    });
    expect(toIngressPermission(makeRule("in", "TCP", "22", "sg-0123456789abcdef"))).toEqual({
      ok: false,
      error: "The VWS API only takes CIDR sources, not security group IDs.",
    });
  });

  it("maps addresses and snapshots", () => {
    expect(
      parseAddresses({ items: [{ allocationId: "eipalloc-1", ownerId: "1", publicIp: "203.0.113.2", domain: "vpc" }] }),
    ).toEqual([
      {
        allocationId: "eipalloc-1",
        name: "",
        address: "203.0.113.2",
        instanceId: "",
        privateIp: "",
        owner: "1",
        region: "vws-1",
      },
    ]);
    expect(
      parseSnapshots({
        items: [
          {
            snapshotId: "snap-1",
            ownerId: "1",
            volumeId: "vol-1",
            volumeSize: 4,
            state: "completed",
            description: "d",
          },
        ],
      }),
    ).toEqual([
      {
        id: "snap-1",
        name: "",
        volumeId: "vol-1",
        sizeGiB: 4,
        description: "d",
        state: "completed",
        started: "",
        owner: "1",
        region: "vws-1",
      },
    ]);
    expect(parseAddresses({ items: [] })).toEqual([]);
  });

  it("maps images", () => {
    expect(
      parseImages({
        items: [{ imageId: "ami-0123456789abcdef0", ownerId: "123456789012", name: "vws-1", state: "available" }],
      }),
    ).toEqual([{ id: "ami-0123456789abcdef0", name: "vws-1", state: "available", owner: "123456789012" }]);
  });

  it("names VPCs and subnets from tags.Name and keeps their tags", () => {
    const [vpc] = parseVpcs({
      items: [
        { vpcId: "vpc-1", cidrBlock: "10.0.0.0/16", state: "available", tags: { Name: "prod", team: "net", bad: 1 } },
      ],
    });
    expect([vpc.name, vpc.tags]).toEqual(["prod", { Name: "prod", team: "net" }]);
    const [subnet] = parseSubnets({
      items: [{ subnetId: "subnet-1", vpcId: "vpc-1", cidrBlock: "10.0.1.0/24", state: "available" }],
    });
    expect([subnet.name, subnet.tags]).toEqual(["", {}]);
  });

  it("reads an instance's public IP and its Elastic IP allocation", () => {
    const [withEip, plain] = parseInstances({
      items: [
        { ...instance, publicIpAddress: "203.0.113.5", publicIpAllocationId: "eipalloc-1" },
        { ...instance, instanceId: "i-2" },
      ],
    });
    expect([withEip.publicIpv4, withEip.elasticIp, withEip.publicIpAllocationId]).toEqual([
      "203.0.113.5",
      "203.0.113.5",
      "eipalloc-1",
    ]);
    expect([plain.publicIpv4, plain.elasticIp, plain.publicIpAllocationId]).toEqual(["", "", ""]);
  });
});

describe("identityFromSession", () => {
  it("shows the root user and account", () => {
    expect(identityFromSession({ principal: "arn:vws:iam::123456789012:root", account: "123456789012" })).toEqual({
      userName: "root",
      accountId: "123456789012",
    });
  });
  it("takes the user name from an IAM user ARN with a path", () => {
    expect(
      identityFromSession({ principal: "arn:vws:iam::123456789012:user/ops/alice", account: "123456789012" }),
    ).toEqual({ userName: "alice", accountId: "123456789012" });
  });
  it("shows a dash for a missing field or session", () => {
    expect(identityFromSession({ principal: "", account: "123456789012" })).toEqual({
      userName: "—",
      accountId: "123456789012",
    });
    expect(identityFromSession({ principal: "arn:vws:iam::1:root" })).toEqual({ userName: "root", accountId: "—" });
    expect(identityFromSession(null)).toEqual({ userName: "—", accountId: "—" });
  });
});

describe("identityFromSession with IAM off", () => {
  it("names the bearer root and keeps the account", () => {
    expect(
      identityFromSession({ principal: "arn:vws:iam::123456789012:root", account: "123456789012" }, { iam: false }),
    ).toEqual({ userName: "root (IAM off)", accountId: "123456789012" });
    expect(identityFromSession(null, { iam: false })).toEqual({ userName: "root (IAM off)", accountId: "—" });
  });
});

describe("account buckets", () => {
  const wire = {
    name: "logs-1",
    ownerId: "123",
    creationDate: "2026-08-02T00:00:00Z",
    region: "vws-1",
    kind: "general",
    versioning: true,
    blockPublicAccess: false,
    nextPageToken: "ignored",
  };

  it("maps creationDate onto created and drops fields the list does not own", () => {
    expect(parseAccountBuckets({ items: [wire], nextPageToken: "later" })).toEqual([
      { name: "logs-1", ownerId: "123", created: "2026-08-02T00:00:00Z" },
    ]);
  });

  it("returns an empty list for an empty page", () => {
    expect(parseAccountBuckets({ items: [] })).toEqual([]);
  });

  it("rejects a page whose items are missing or null", () => {
    expect(() => parseAccountBuckets({})).toThrow();
    expect(() => parseAccountBuckets({ items: null })).toThrow();
  });

  it("rejects a bad name or an empty creation date, and leaves a missing owner blank", () => {
    expect(() => toAccountBucket({ name: "A", ownerId: "1", creationDate: "2026-08-02T00:00:00Z" })).toThrow();
    expect(() => toAccountBucket({ name: "logs-1", ownerId: "1", creationDate: "" })).toThrow();
    expect(toAccountBucket({ name: "logs-1", creationDate: "2026-08-02T00:00:00Z" })).toEqual({
      name: "logs-1",
      ownerId: "",
      created: "2026-08-02T00:00:00Z",
    });
  });

  it("rejects a body whose name is not the one requested", () => {
    const name = parseBucketName("logs-1");
    if (!name) throw new Error("logs-1");
    expect(() =>
      toAccountBucket({ name: "other-1", ownerId: "1", creationDate: "2026-08-02T00:00:00Z" }, name),
    ).toThrow();
  });

  it("trims a bucket name once and rejects names outside the rule", () => {
    expect(parseBucketName(" logs-1 ")).toBe("logs-1");
    expect(parseBucketName("ab")).toBeNull();
    expect(parseBucketName("A")).toBeNull();
    expect(parseBucketName("-ab")).toBeNull();
    expect(parseBucketName("ab-")).toBeNull();
    expect(parseBucketName("example.com")).toBeNull();
  });

  it("rejects reserved prefixes and suffixes", () => {
    expect(parseBucketName("xn--ab")).toBeNull();
    expect(parseBucketName("sthree-logs")).toBeNull();
    expect(parseBucketName("amzn-s3-demo-ab")).toBeNull();
    expect(parseBucketName("logs-s3alias")).toBeNull();
    expect(parseBucketName("ab--ol-s3")).toBeNull();
    expect(parseBucketName("ab--x-s3")).toBeNull();
    expect(parseBucketName("ab--table-s3")).toBeNull();
    expect(parseStoredBucketName("ab--table-s3")).toBe("ab--table-s3");
  });

  it("still reads a reserved name the API already stored", () => {
    expect(toAccountBucket({ name: "xn--ab", ownerId: "1", creationDate: "2026-08-02T00:00:00Z" })).toEqual({
      name: "xn--ab",
      ownerId: "1",
      created: "2026-08-02T00:00:00Z",
    });
  });
});
