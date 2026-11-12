// A deterministic console-api for the admin e2e (run with `node`, which strips the types). IAM is on and the session
// cookie names the caller: "root" is the administrator with nothing registered yet, and any other signed-in caller
// gets console-api's 403 answers on the admin routes. Two regions take writes and hold instances, a volume and what
// a launch needs; every compute write is a 202 operation that GET /operations/{id} finishes.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const denied = { error: { code: "PermissionDenied", message: "administrator required" }, requestId: "req-e2e-denied" };
type Json = Record<string, unknown>;
const regions = new Map<string, { version: number; body: Json }>();
const failure = (code: string, message: string, field?: string) => ({
  error: { code, field, message },
  requestId: "req-e2e",
});
const invalid = (field: string, message: string) => failure("InvalidArgument", message, field);

/** A partial copy of validateRegion (vws-console-api internal/surface/console/admin_regions.go). */
function refused(region: Json, secret: unknown, create: boolean) {
  const name = /^pve-[a-z0-9]+(-[a-z0-9]+)*-[0-9]+$/.test(String(region.name));
  if (!name) return invalid("name", "invalid Proxmox region name");
  const cluster = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(String(region.clusterName));
  if (!cluster) return invalid("clusterName", "invalid cluster name");
  const badSecret = secret === undefined ? create : !/^[A-Za-z0-9._-]{1,512}$/.test(String(secret));
  return badSecret ? invalid("tokenSecret", "expected 1-512 token characters") : null;
}

/**
 * Capability documents by region name: a read-only Proxmox region and an AWS region, the documents of the unit
 * fixtures (src/lib/vws-api/testdata). "pve-down-1" is listed too, and its capability read fails.
 */
const capabilities: Record<string, Json> = JSON.parse(
  readFileSync(new URL("./testdata/capabilities.json", import.meta.url), "utf8"),
);
/** "pve-lab-2" takes writes: the read-only Proxmox document with every action it refuses as ReadOnly served. */
const WRITABLE = "pve-lab-2";
const readOnly = capabilities["pve-lab-1"];
capabilities[WRITABLE] = {
  ...readOnly,
  region: WRITABLE,
  actions: Object.fromEntries(
    Object.entries(readOnly.actions as Record<string, Json>).map(([name, capability]) => [
      name,
      capability.reasonCode === "ReadOnly" ? { state: "supported" } : capability,
    ]),
  ),
};
const listed = [...Object.keys(capabilities), "pve-down-1"].sort().map((name) => ({
  name,
  kind: capabilities[name]?.kind === "aws" ? "aws" : "pve",
  state: "available",
}));

/**
 * The compute resources of the regions that take writes. A terminated instance stays listed in both, so the Proxmox
 * region shows the console dropping the row itself. The AWS document marks most reads `empty`; they are listed here
 * all the same, so every form can be filled.
 */
type Row = Json & { region: string };
const seed = (): Record<string, Row[]> => {
  const rows = (make: (n: number) => Json[]): Row[] =>
    [WRITABLE, "ap-northeast-2"].flatMap((region, index) => make(index + 1).map((row) => ({ ...row, region })));
  return {
    instances: rows((n) => [
      { instanceId: `i-${n}0000001`, state: "running", instanceType: "vws.small", tags: { Name: "web" } },
      { instanceId: `i-${n}0000002`, state: "stopped", instanceType: "vws.small", tags: { Name: "batch" } },
    ]),
    volumes: rows((n) => [{ volumeId: `vol-${n}0000001`, state: "available", size: 8, volumeType: "gp3" }]),
    snapshots: [],
    images: rows((n) => [{ imageId: `ami-${n}0000001`, name: "Debian 12", state: "available" }]),
    "instance-types": rows(() => [{ instanceType: "vws.small", vcpus: 1, memoryMiB: 1024 }]),
    vpcs: rows((n) => [{ vpcId: `vpc-${n}0000001`, cidrBlock: `10.${n}.0.0/16`, state: "available" }]),
    subnets: rows((n) => [
      { subnetId: `subnet-${n}0000001`, vpcId: `vpc-${n}0000001`, cidrBlock: `10.${n}.1.0/24`, state: "available" },
    ]),
  };
};
let compute = seed();
/** Every compute write, and each operation read once, as "POST /instances/stop pve-lab-2", for the specs to read. */
let seen: string[] = [];
/** What finishing each operation does. While `held`, a read answers "running" and finishes nothing. */
let operations = new Map<string, () => void>();
let held = false;
let serial = 0;

/**
 * The state at accept time and the state when the operation finishes (console-api NextInstanceState). Terminate
 * takes every other state through DYING; any other missing entry is a Conflict.
 */
const NEXT: Record<string, Record<string, [string, string] | undefined>> = {
  stop: { running: ["stopping", "stopped"], stopped: ["stopped", "stopped"] },
  start: { stopped: ["pending", "running"] },
  reboot: { running: ["running", "running"] },
  terminate: { terminated: ["terminated", "terminated"] },
};
const DYING: [string, string] = ["shutting-down", "terminated"];

const PASSED = {
  tls: "PVE TLS certificate verified",
  version: "PVE version read succeeded",
  cluster_name: "cluster_name accepted",
  privileges: "token privileges are read-only",
  regionapi: "regionapi mTLS status read succeeded",
};

/** console-api's step names, order and messages. "unreachable" in the URL is this fake's own switch for a failure. */
function connectionSteps(region: Json, secret: unknown) {
  const down = secret !== undefined && String(region.pveApiUrl).includes("unreachable");
  return Object.entries(PASSED).map(([name, message], index) => {
    if (down && index === 0) return { name, result: "FAIL", message: "PVE TLS handshake failed" };
    if (down) return { name, result: "SKIPPED", message: "previous step failed" };
    if (secret !== undefined || name === "regionapi") return { name, result: "PASS", message };
    return { name, result: "SKIPPED", message: "tokenSecret is needed; only the region daemon stores it" };
  });
}

createServer(async (request, response) => {
  const send = (status: number, body: unknown) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
  const read = async (): Promise<Json> => {
    let text = "";
    for await (const chunk of request) text += chunk;
    return text ? JSON.parse(text) : {};
  };
  const path = (request.url ?? "").split("?")[0].replace(/^\/api\/v1/, "");
  const user = /__Host-vws_session=([^;]+)/.exec(request.headers.cookie ?? "")?.[1];
  if (path === "/healthz") return send(200, { status: "ok" });
  if (path === "/__reset") {
    regions.clear();
    return send(204, null);
  }
  if (path === "/__compute") {
    const { reset, hold } = await read();
    if (reset) [compute, seen, operations, serial] = [seed(), [], new Map(), 0];
    if (typeof hold === "boolean") held = hold;
    return send(200, { seen });
  }
  if (!user) return send(401, { error: { code: "Unauthenticated", message: "Sign in." } });
  const principal = `arn:vws:iam::123456789012:user/${user}`;
  if (path === "/auth/session") return send(200, { loginEnabled: true, principal, account: "123456789012" });
  if (path === "/admin/permissions") {
    return user === "root" ? send(200, { permissions: ["vws:AdminListRegions"] }) : send(403, { permissions: [] });
  }
  if (path === "/regions") return send(200, { items: listed });
  const region = /^\/regions\/([^/]+)\/capabilities$/.exec(path)?.[1];
  if (region) {
    return capabilities[region]
      ? send(200, capabilities[region])
      : send(503, failure("Unavailable", "region unavailable"));
  }
  const method = request.method;
  // console-api's rules for a cookie write. Its CSRF token is derived from the session; here it is the session value.
  const browserWrite =
    request.headers.origin &&
    request.headers["x-csrf-token"] === user &&
    request.headers["content-type"] === "application/json";
  const zone = String(request.headers["x-vws-region"] ?? "");
  const [, collection = "", id, verb] = /^\/([a-z-]+)(?:\/([^/]+))?(?:\/([a-z]+))?$/.exec(path) ?? [];
  if (collection === "operations" && id) {
    const finish = operations.get(id);
    if (!finish) return send(404, failure("NotFound", "operation not found"));
    if (!seen.includes(`GET ${path} ${zone}`)) seen.push(`GET ${path} ${zone}`);
    if (held) return send(200, { id, state: "running" });
    finish();
    operations.set(id, () => undefined);
    return send(200, { id, state: "succeeded" });
  }
  if (Object.hasOwn(compute, collection)) {
    const rows = compute[collection];
    if (method === "GET") {
      const here = rows.filter((row) => zone === "all" || row.region === zone);
      if (!id) return send(200, { items: here });
      const one = here.find((row) => Object.values(row).includes(id));
      return one ? send(200, one) : send(404, failure("NotFound", `${id} not found`));
    }
    if (!browserWrite) return send(403, denied);
    seen.push(`${method} ${path} ${zone}`);
    const input = await read();
    const accept = (items: Json[], finish: () => void) => {
      const operation = { id: `op-${operations.size + 1}`, state: "running" };
      operations.set(operation.id, finish);
      return send(202, { operation, items });
    };
    const newId = (prefix: string) => `${prefix}-${(0xa0000000 + ++serial).toString(16)}`;
    const pending = { state: "pending", region: zone };
    if (collection === "snapshots" && !id) {
      const volume = compute.volumes.find((row) => row.volumeId === input.volumeId && row.region === zone);
      if (!volume) return send(404, failure("NotFound", "volume not found"));
      const { volumeId, description = "" } = input;
      const snapshot = { snapshotId: newId("snap"), volumeId, description, volumeSize: volume.size, ...pending };
      rows.push(snapshot);
      return accept([snapshot], () => (snapshot.state = "completed"));
    }
    if (collection !== "instances") return send(404, failure("NotFound", "no such route"));
    if (!id) {
      const { count = 1, ...launch } = input;
      const made = Array.from({ length: Number(count) }, () => ({ instanceId: newId("i"), ...launch, ...pending }));
      rows.push(...made);
      return accept(made, () => made.forEach((row) => (row.state = "running")));
    }
    // console-api serves a batch route for stop, start and terminate; RebootInstances has the per-instance one only.
    const action = verb ?? id;
    const ids: unknown = verb ? [id] : action === "reboot" ? null : input.instanceIds;
    const steps = NEXT[action];
    if (!steps || !Array.isArray(ids)) return send(404, failure("NotFound", "no such route"));
    const plans = rows
      .filter((row) => row.region === zone && ids.includes(row.instanceId))
      .map((row) => ({ row, step: steps[String(row.state)] ?? (action === "terminate" ? DYING : undefined) }));
    if (plans.length !== ids.length) return send(404, failure("NotFound", "instance not found"));
    const stuck = plans.find((plan) => !plan.step);
    if (stuck) {
      const done = action === "stop" ? "stopped" : `${action}ed`;
      return send(409, failure("Conflict", `instance cannot be ${done} from ${stuck.row.state}`));
    }
    for (const { row, step } of plans) row.state = step?.[0];
    return accept(
      plans.map(({ row, step }) => ({ instanceId: row.instanceId, currentState: step?.[0] })),
      () => plans.forEach(({ row, step }) => (row.state = step?.[1])),
    );
  }
  if (path.startsWith("/admin/") && user !== "root") return send(403, denied);
  const [found, name, tail] = /^\/admin\/regions(?:\/([^/]+))?(?:\/(health|test))?$/.exec(path) ?? [];
  if (!found) return send(200, { items: [] });
  if (method === "GET" && !name) return send(200, { items: [...regions.values()].map((region) => region.body) });
  if (method !== "GET" && !browserWrite) return send(403, denied);
  const { tokenSecret, ...input } = await read();
  const unsaved = method === "POST" && name === "test";
  const saved = unsaved ? undefined : regions.get(name ?? String(input.name));
  if (name && !unsaved && !saved) return send(404, failure("NotFound", "registration not found"));
  if (tail === "health") {
    const nodes = [{ name: "pve1", online: true }];
    return send(200, { status: "ok", quorate: true, leader: "pve1", nodes, checkedAt: "2026-11-12T00:00:00Z" });
  }
  if (method === "GET") {
    response.setHeader("etag", `"${saved?.version}"`);
    return send(200, saved?.body);
  }
  if (method === "DELETE") {
    regions.delete(String(name));
    return send(204, null);
  }
  if (method === "PATCH" && request.headers["if-match"] !== `"${saved?.version}"`) {
    return send(409, failure("Conflict", "registration already exists or changed"));
  }
  if (tail === "test" && Object.keys(input).length > 0) {
    return send(400, invalid("name", "saved tests accept only tokenSecret; use the unsaved test for edits"));
  }
  const body: Json = { zones: [], ...saved?.body, ...input };
  const problem = !name && saved ? invalid("name", "already registered") : refused(body, tokenSecret, !saved);
  if (problem) return send(400, problem);
  if (tail === "test" || unsaved) return send(200, { steps: connectionSteps(body, tokenSecret) });
  if (tokenSecret !== undefined) {
    const fingerprint = createHash("sha256").update(String(tokenSecret)).digest("hex").slice(0, 8);
    body.tokenSecret = { set: true, fingerprint };
  }
  const version = (saved?.version ?? 0) + 1;
  regions.set(String(body.name), { version, body });
  response.setHeader("etag", `"${version}"`);
  return send(saved ? 200 : 201, body);
}).listen(Number(process.env.FAKE_API_PORT ?? 43321), "127.0.0.1");
