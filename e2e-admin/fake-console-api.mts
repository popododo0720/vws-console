// A deterministic console-api for the admin e2e (run with `node`, which strips the types). IAM is on and the session
// cookie names the caller: "root" is the administrator with nothing registered yet, and any other signed-in caller
// gets console-api's 403 answers on the admin routes. Regions live in memory as console-api keeps them: a version per
// record (ETag, If-Match), its field errors, and a secret only as the first 8 hex digits of its SHA-256. POST /__reset
// empties the registry.
import { createHash } from "node:crypto";
import { createServer } from "node:http";

const denied = { error: { code: "PermissionDenied", message: "administrator required" }, requestId: "req-e2e-denied" };
type Json = Record<string, unknown>;
const regions = new Map<string, { version: number; body: Json }>();
const failure = (code: string, message: string, field?: string) => ({
  error: { code, field, message },
  requestId: "req-e2e",
});
const invalid = (field: string, message: string) => failure("InvalidArgument", message, field);

/** The checks of console-api's validateRegion that the e2e trips. */
function refused(region: Json, secret: unknown, create: boolean) {
  const name = /^pve-[a-z0-9]+(-[a-z0-9]+)*-[0-9]+$/.test(String(region.name));
  if (!name) return invalid("name", "invalid Proxmox region name");
  const cluster = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(String(region.clusterName));
  if (!cluster) return invalid("clusterName", "invalid cluster name");
  const badSecret = secret === undefined ? create : !/^[A-Za-z0-9._-]{1,512}$/.test(String(secret));
  return badSecret ? invalid("tokenSecret", "expected 1-512 token characters") : null;
}

const PASSED = {
  tls: "PVE TLS certificate verified",
  version: "PVE version read succeeded",
  cluster_name: "cluster_name accepted",
  privileges: "token privileges are read-only",
  regionapi: "regionapi mTLS status read succeeded",
};

/** console-api's steps: no secret skips the PVE checks, and a host named "unreachable" fails TLS and skips the rest. */
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
  const path = (request.url ?? "").split("?")[0].replace(/^\/api\/v1/, "");
  const user = /__Host-vws_session=([^;]+)/.exec(request.headers.cookie ?? "")?.[1];
  if (path === "/healthz") return send(200, { status: "ok" });
  if (path === "/__reset") {
    regions.clear();
    return send(204, null);
  }
  if (!user) return send(401, { error: { code: "Unauthenticated", message: "Sign in." } });
  const principal = `arn:vws:iam::123456789012:user/${user}`;
  if (path === "/auth/session") return send(200, { loginEnabled: true, principal, account: "123456789012" });
  if (path === "/admin/permissions") {
    return user === "root" ? send(200, { permissions: ["vws:AdminListRegions"] }) : send(403, { permissions: [] });
  }
  if (path.startsWith("/admin/") && user !== "root") return send(403, denied);
  const [found, name, tail] = /^\/admin\/regions(?:\/([^/]+))?(?:\/(health|test))?$/.exec(path) ?? [];
  if (!found) return send(200, { items: [] });
  const method = request.method;
  if (method === "GET" && !name) return send(200, { items: [...regions.values()].map((region) => region.body) });
  // console-api refuses a cookie write without the CSRF token, an Origin and a JSON content type.
  const csrf = /vws_csrf=([^;]+)/.exec(request.headers.cookie ?? "")?.[1];
  const browserWrite = request.headers.origin && request.headers["x-csrf-token"] === csrf;
  if (method !== "GET" && !(browserWrite && request.headers["content-type"] === "application/json")) {
    return send(403, denied);
  }
  let text = "";
  for await (const chunk of request) text += chunk;
  const { tokenSecret, ...input }: Json = text ? JSON.parse(text) : {};
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
