// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "http://console.test" }) }));
vi.mock("./session", () => ({ currentSession: async () => ({ session: "sess-1", csrf: "csrf-1" }) }));

import type { CreateAttempt, IdempotencyKey, KeyPairId } from "@/lib/key-pair";
import type { BucketName } from "./adapter";
import * as vws from "./client";
import { keyPath, route, withQuery } from "./route";

/** The path formulas client.ts used before route(): `seg` (encodeURIComponent) per ID, the object key per segment. */
const enc = encodeURIComponent;
const oldObjectPath = (bucket: string, key: string) =>
  `/buckets/${enc(bucket)}/objects/${key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
const oldListQuery = (path: string, pageSize: number | undefined, token: string) => {
  const params: string[] = [];
  if (pageSize !== undefined) params.push(`pageSize=${pageSize}`);
  if (token) params.push(`pageToken=${encodeURIComponent(token)}`);
  return params.length === 0 ? path : `${path}?${params.join("&")}`;
};

const ID = "id with/slash?q=1#frag%25&é";
const BUCKET = "bucket?x=/y" as BucketName;
const KEY = "dir one/sub+dir/a?b#c%25é.txt";
const TOKEN = "tok/=&?+ en";
const OP = "op/1 ?";
const KEY_PAIR = "key-0123456789abcdef0" as KeyPairId;
const api = (path: string) => `http://api.test/api/v1${path}`;
const PVE = { name: ID, clusterName: "", pveApiUrl: "", caPem: "", tokenId: "", regionEndpoint: "", zones: [] };
const PVE_URL = api(`/admin/regions/${enc(ID)}`);

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const page = (token?: string) => respond(200, { items: [], ...(token ? { nextPageToken: token } : {}) });
const accepted = () => respond(202, { operation: { id: OP, state: "running" }, items: [{ groupId: "sg-1" }] });
const succeeded = () => respond(200, { id: OP, state: "succeeded" });

type Row = { name: string; run: () => Promise<unknown>; sent: string[]; replies?: () => Response[] };

const rows: Row[] = [
  { name: "listImages", run: vws.listImages, sent: [`GET ${api("/images")}`] },
  { name: "listInstances", run: vws.listInstances, sent: [`GET ${api("/instances")}`] },
  { name: "listVolumes", run: vws.listVolumes, sent: [`GET ${api("/volumes")}`] },
  {
    name: "listVpcs (paged)",
    run: vws.listVpcs,
    replies: () => [page(TOKEN), page()],
    sent: [`GET ${api("/vpcs")}`, `GET ${api(oldListQuery("/vpcs", undefined, TOKEN))}`],
  },
  { name: "listSubnets", run: vws.listSubnets, sent: [`GET ${api("/subnets")}`] },
  {
    name: "listBuckets (paged)",
    run: vws.listBuckets,
    replies: () => [page(TOKEN), page()],
    sent: [`GET ${api(oldListQuery("/buckets", 100, ""))}`, `GET ${api(oldListQuery("/buckets", 100, TOKEN))}`],
  },
  { name: "listKeyPairs", run: vws.listKeyPairs, sent: [`GET ${api("/key-pairs")}`] },
  { name: "listInstanceTypes", run: vws.listInstanceTypes, sent: [`GET ${api("/instance-types")}`] },
  { name: "listSecurityGroups", run: vws.listSecurityGroups, sent: [`GET ${api("/security-groups")}`] },
  { name: "listAddresses", run: vws.listAddresses, sent: [`GET ${api("/addresses")}`] },
  { name: "listSnapshots", run: vws.listSnapshots, sent: [`GET ${api("/snapshots")}`] },
  { name: "listRegions", run: vws.listRegions, sent: [`GET ${api("/regions")}`] },
  { name: "putBucket", run: () => vws.putBucket(BUCKET), sent: [`PUT ${api(`/buckets/${enc(BUCKET)}`)}`] },
  { name: "getBucket", run: () => vws.getBucket(BUCKET), sent: [`GET ${api(`/buckets/${enc(BUCKET)}`)}`] },
  { name: "deleteBucket", run: () => vws.deleteBucket(BUCKET), sent: [`DELETE ${api(`/buckets/${enc(BUCKET)}`)}`] },
  {
    name: "putObject",
    run: () => vws.putObject(BUCKET, KEY, new Uint8Array([1]), "text/plain"),
    sent: [`PUT ${api(oldObjectPath(BUCKET, KEY))}`],
  },
  { name: "getObject", run: () => vws.getObject(BUCKET, KEY), sent: [`GET ${api(oldObjectPath(BUCKET, KEY))}`] },
  {
    name: "getObjectMeta",
    run: () => vws.getObjectMeta(BUCKET, KEY),
    sent: [`GET ${api(oldObjectPath(BUCKET, KEY))}`],
  },
  {
    name: "deleteObject",
    run: () => vws.deleteObject(BUCKET, KEY),
    sent: [`DELETE ${api(oldObjectPath(BUCKET, KEY))}`],
  },
  { name: "getInstance", run: () => vws.getInstance(ID), sent: [`GET ${api(`/instances/${enc(ID)}`)}`] },
  { name: "getVpc", run: () => vws.getVpc(ID), sent: [`GET ${api(`/vpcs/${enc(ID)}`)}`] },
  { name: "getVolume", run: () => vws.getVolume(ID), sent: [`GET ${api(`/volumes/${enc(ID)}`)}`] },
  {
    name: "launchInstances (202, polled)",
    run: () =>
      vws.launchInstances({
        imageId: "ami-1",
        instanceType: "vws.small",
        subnetId: "subnet-1",
        count: 1,
        tags: {},
        keyPair: { kind: "none" },
      }),
    replies: () => [accepted(), succeeded()],
    sent: [`POST ${api("/instances")}`, `GET ${api(`/operations/${encodeURIComponent(OP)}`)}`],
  },
  {
    name: "createKeyPair (202, polled)",
    run: () =>
      vws.createKeyPair({
        idempotencyKey: "attempt-routes" as IdempotencyKey,
        body: '{"keyName":"laptop","publicKeyMaterial":"ssh-ed25519 AAAA"}',
      } satisfies CreateAttempt),
    replies: () => [
      respond(202, {
        operation: { id: OP, state: "running" },
        items: [{ keyPairId: KEY_PAIR, keyName: "laptop", keyFingerprint: "f", keyType: "ed25519", ownerId: "1" }],
      }),
      succeeded(),
    ],
    sent: [`POST ${api("/key-pairs")}`, `GET ${api(`/operations/${encodeURIComponent(OP)}`)}`],
  },
  {
    name: "deleteKeyPair",
    run: () => vws.deleteKeyPair(KEY_PAIR),
    sent: [`POST ${api(`/key-pairs/${enc(KEY_PAIR)}/delete`)}`],
  },
  ...(["start", "stop", "terminate"] as const).map((action) => ({
    name: `instanceBatch ${action}`,
    run: () => vws.instanceBatch(action, ["i-1"]),
    sent: [`POST ${api(`/instances/${action}`)}`],
  })),
  {
    name: "createInstanceTags",
    run: () => vws.createInstanceTags(ID, { Name: "x" }),
    sent: [`POST ${api(`/instances/${enc(ID)}/tags`)}`],
  },
  {
    name: "createVolume",
    run: () =>
      vws.createVolume(
        { volumeType: "gp3", availabilityZone: "az-1", size: 8, iops: null, throughput: null, snapshotId: null },
        "volume-key" as IdempotencyKey,
      ),
    sent: [`POST ${api("/volumes")}`],
  },
  { name: "deleteVolume", run: () => vws.deleteVolume(ID), sent: [`POST ${api(`/volumes/${enc(ID)}/delete`)}`] },
  {
    name: "createSnapshot",
    run: () => vws.createSnapshot({ volumeId: "vol-1", description: "" }, "snap-key" as IdempotencyKey),
    sent: [`POST ${api("/snapshots")}`],
  },
  { name: "createVpc", run: () => vws.createVpc("10.0.0.0/16"), sent: [`POST ${api("/vpcs")}`] },
  { name: "deleteVpc", run: () => vws.deleteVpc(ID), sent: [`POST ${api(`/vpcs/${enc(ID)}/delete`)}`] },
  { name: "createSubnet", run: () => vws.createSubnet("vpc-1", "10.0.0.0/24"), sent: [`POST ${api("/subnets")}`] },
  {
    name: "createVpcTags",
    run: () => vws.createVpcTags(ID, { Name: "x" }),
    sent: [`POST ${api(`/vpcs/${enc(ID)}/tags`)}`],
  },
  {
    name: "createSubnetTags",
    run: () => vws.createSubnetTags(ID, { Name: "x" }),
    sent: [`POST ${api(`/subnets/${enc(ID)}/tags`)}`],
  },
  { name: "deleteSubnet", run: () => vws.deleteSubnet(ID), sent: [`POST ${api(`/subnets/${enc(ID)}/delete`)}`] },
  { name: "modifyVolume", run: () => vws.modifyVolume(ID, 9), sent: [`POST ${api(`/volumes/${enc(ID)}/modify`)}`] },
  {
    name: "attachVolume",
    run: () => vws.attachVolume(ID, { instanceId: "i-1", device: "/dev/sdf" }),
    sent: [`POST ${api(`/volumes/${enc(ID)}/attach`)}`],
  },
  { name: "detachVolume", run: () => vws.detachVolume(ID), sent: [`POST ${api(`/volumes/${enc(ID)}/detach`)}`] },
  {
    name: "createSecurityGroup (202, polled)",
    run: () => vws.createSecurityGroup("web", "vpc-1"),
    replies: () => [accepted(), succeeded()],
    sent: [`POST ${api("/security-groups")}`, `GET ${api(`/operations/${encodeURIComponent(OP)}`)}`],
  },
  {
    name: "authorizeIngress",
    run: () => vws.authorizeIngress(ID, [{ ipProtocol: "tcp", fromPort: 22, toPort: 22, cidrIp: "10.0.0.0/8" }]),
    sent: [`POST ${api(`/security-groups/${enc(ID)}/authorize-ingress`)}`],
  },
  {
    name: "revokeIngress",
    run: () => vws.revokeIngress(ID, { ipProtocol: "tcp", fromPort: 22, toPort: 22, cidrIp: "10.0.0.0/8" }),
    sent: [`POST ${api(`/security-groups/${enc(ID)}/revoke-ingress`)}`],
  },
  {
    name: "deleteSecurityGroup",
    run: () => vws.deleteSecurityGroup(ID),
    sent: [`POST ${api(`/security-groups/${enc(ID)}/delete`)}`],
  },
  { name: "allocateAddress", run: vws.allocateAddress, sent: [`POST ${api("/addresses")}`] },
  {
    name: "associateAddress",
    run: () => vws.associateAddress(ID, "i-1"),
    sent: [`POST ${api(`/addresses/${enc(ID)}/associate`)}`],
  },
  {
    name: "disassociateAddress",
    run: () => vws.disassociateAddress(ID),
    sent: [`POST ${api(`/addresses/${enc(ID)}/disassociate`)}`],
  },
  {
    name: "releaseAddress",
    run: () => vws.releaseAddress(ID),
    sent: [`POST ${api(`/addresses/${enc(ID)}/release`)}`],
  },
  { name: "deleteSnapshot", run: () => vws.deleteSnapshot(ID), sent: [`POST ${api(`/snapshots/${enc(ID)}/delete`)}`] },
  { name: "getAdminPermissions", run: vws.getAdminPermissions, sent: [`GET ${api("/admin/permissions")}`] },
  { name: "listAdminRegions", run: vws.listAdminRegions, sent: [`GET ${api("/admin/regions")}`] },
  { name: "listAdminAwsAccounts", run: vws.listAdminAwsAccounts, sent: [`GET ${api("/admin/aws-accounts")}`] },
  { name: "getAdminRegion", run: () => vws.getAdminRegion(ID), sent: [`GET ${api(`/admin/regions/${enc(ID)}`)}`] },
  {
    name: "getAdminRegionHealth",
    run: () => vws.getAdminRegionHealth(ID),
    sent: [`GET ${api(`/admin/regions/${enc(ID)}/health`)}`],
  },
  {
    name: "saveAdminRegion (register, then edit)",
    run: async () => [await vws.saveAdminRegion(PVE, null), await vws.saveAdminRegion(PVE, '"3"')],
    sent: [`POST ${api("/admin/regions")}`, `PATCH ${PVE_URL}`],
  },
  { name: "deleteAdminRegion", run: () => vws.deleteAdminRegion(ID), sent: [`DELETE ${PVE_URL}`] },
  {
    name: "testAdminRegion (unsaved, then saved)",
    run: async () => [await vws.testAdminRegion(PVE, false), await vws.testAdminRegion(PVE, true)],
    sent: [`POST ${api("/admin/regions/test")}`, `POST ${PVE_URL}/test`],
  },
  {
    name: "login",
    run: () => vws.login({ account: "1", userName: "root", password: "p" }),
    sent: [`POST ${api("/auth/login")}`],
  },
  { name: "logout", run: vws.logout, sent: [`POST ${api("/auth/logout")}`] },
  { name: "getSession", run: vws.getSession, sent: [`GET ${api("/auth/session")}`] },
  { name: "signedInSession", run: vws.signedInSession, sent: [`GET ${api("/auth/session")}`] },
];

describe("console-api URLs after the route() migration", () => {
  let sent: string[];
  let queue: Response[];

  beforeEach(() => {
    sent = [];
    queue = [];
    vi.useFakeTimers();
    vi.stubEnv("VWS_CONSOLE_API_URL", "http://api.test/");
    vi.stubEnv("VWS_CONSOLE_IAM", "on");
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      sent.push(`${init.method ?? "GET"} ${url}`);
      return queue.shift() ?? respond(200, {});
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(rows)("$name sends the same bytes as before", async ({ run, replies, sent: expected }) => {
    queue = replies?.() ?? [];
    const pending = run().catch(() => undefined);
    await vi.runAllTimersAsync();
    await pending;
    expect(sent).toEqual(expected);
  });

  it("covers every exported client function that calls console-api", () => {
    const covered = new Set(rows.map((row) => row.name.split(" ")[0]));
    const callers = Object.entries(vws)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name);
    expect(callers.filter((name) => !covered.has(name))).toEqual([]);
  });
});

describe("route", () => {
  it("keeps the template and encodes every param into the path only", () => {
    const vpc = route("/vpcs/{id}/delete", { id: ID });
    expect(vpc.template).toBe("/vpcs/{id}/delete");
    expect(vpc.path).toBe(`/vpcs/${enc(ID)}/delete`);
    const object = route("/buckets/{name}/objects/{key}", { name: BUCKET, key: keyPath(KEY) });
    expect(object.template).toBe("/buckets/{name}/objects/{key}");
    expect(object.path).toBe(oldObjectPath(BUCKET, KEY));
  });

  it("puts a query on the path and never on the template", () => {
    const listed = withQuery(route("/buckets"), { pageSize: 100, pageToken: TOKEN });
    expect(listed.template).toBe("/buckets");
    expect(listed.path).toBe(oldListQuery("/buckets", 100, TOKEN));
    expect(withQuery(route("/vpcs"), { pageSize: undefined, pageToken: "" }).path).toBe("/vpcs");
  });

  it("refuses a template that is not lowercase segments and {params}", () => {
    const built = `/vpcs/${"vpc-1?token=secret"}` as "/vpcs";
    expect(() => route(built)).toThrow(/route template/);
    expect(() => route("/vpcs/../secret" as "/vpcs")).toThrow(/route template/);
    expect(() => route("/vpcs/{id}" as "/vpcs")).toThrow(/missing \{id\}/);
  });

  it("is a type error to build a template from a variable or to miss a param", () => {
    const typeChecksOnly = (id: string) => [
      // @ts-expect-error a template literal with a hole could carry an ID
      route(`/vpcs/${id}`),
      // @ts-expect-error {id} needs a param
      route("/vpcs/{id}"),
      // @ts-expect-error the param is named id, not vpcId
      route("/vpcs/{id}", { vpcId: id }),
    ];
    expect(typeChecksOnly).toBeTypeOf("function");
  });
});
