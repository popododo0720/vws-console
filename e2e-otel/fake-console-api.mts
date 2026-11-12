// A deterministic console-api for the OTel e2e (run with `node`, which strips the types).
// IAM is on: GET /auth/session answers 401 without the session cookie. The first GET /vpcs answers 503 so the
// console retries it, POST /vpcs is accepted as a 202 operation that the console polls, and GET /snapshots never
// answers so the console times out. Every other list is empty. It lists one region whose capability document serves
// every action: with no document the console refuses every write and never offers Create VPC.
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const port = Number(process.env.FAKE_API_PORT ?? 43320);
const session = process.env.FAKE_API_SESSION ?? "sess-e2e";
const csrf = process.env.FAKE_API_CSRF ?? "csrf-e2e";
let vpcGets = 0;

/** The AWS document of the capability fixtures, the one the admin e2e fake serves too. */
const REGION = "ap-northeast-2";
const documents: Record<string, unknown> = JSON.parse(
  readFileSync(new URL("../e2e-admin/testdata/capabilities.json", import.meta.url), "utf8"),
);
if (!(REGION in documents)) throw new Error(`e2e-admin/testdata/capabilities.json has no ${REGION} document`);

function send(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string | string[]> = {},
) {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}

function signedIn(request: IncomingMessage): boolean {
  return (request.headers.cookie ?? "").includes(`__Host-vws_session=${session}`);
}

const server = createServer((request, response) => {
  const path = (request.url ?? "").split("?")[0].replace(/^\/api\/v1/, "");
  const route = `${request.method} ${path}`;
  if (route === "GET /healthz") return send(response, 200, { status: "ok" });
  if (route === "POST /auth/login") {
    return send(
      response,
      200,
      { loginEnabled: true, principal: "root" },
      {
        "set-cookie": [
          `__Host-vws_session=${session}; Path=/; HttpOnly; Max-Age=3600`,
          `vws_csrf=${csrf}; Path=/; HttpOnly; Max-Age=3600`,
        ],
      },
    );
  }
  if (route === "POST /auth/logout") return send(response, 200, {});
  if (route === "GET /auth/session") {
    if (!signedIn(request)) return send(response, 401, { error: { code: "Unauthenticated", message: "Sign in." } });
    return send(response, 200, { loginEnabled: true, principal: "root", account: "123456789012", root: true });
  }
  if (!signedIn(request)) return send(response, 401, { error: { code: "Unauthenticated", message: "Sign in." } });
  if (route === "GET /regions") {
    return send(response, 200, { items: [{ name: REGION, kind: "aws", state: "available" }] });
  }
  if (route === `GET /regions/${REGION}/capabilities`) return send(response, 200, documents[REGION]);
  if (route === "GET /vpcs") {
    vpcGets += 1;
    if (vpcGets === 1) return send(response, 503, { error: { code: "ServiceUnavailable", message: "Busy." } });
    return send(response, 200, { items: [] });
  }
  if (route === "POST /vpcs") {
    return send(response, 202, { operation: { id: "op-e2e-1", state: "running" }, items: [{ vpcId: "vpc-0e2e" }] });
  }
  if (route === "GET /operations/op-e2e-1") return send(response, 200, { id: "op-e2e-1", state: "succeeded" });
  // Never answers: the console's per-attempt deadline aborts each attempt.
  if (route === "GET /snapshots") return;
  if (request.method === "GET") return send(response, 200, { items: [] });
  return send(response, 404, { error: { code: "NotFound", message: "No such route." } });
});

server.listen(port, "127.0.0.1");
