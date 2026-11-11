// A deterministic console-api for the admin e2e (run with `node`, which strips the types). IAM is on and the session
// cookie names the caller: "root" is the administrator with nothing registered yet, and any other signed-in caller
// gets console-api's 403 answers on the admin routes.
import { createServer } from "node:http";

const denied = { error: { code: "PermissionDenied", message: "administrator required" }, requestId: "req-e2e-denied" };

createServer((request, response) => {
  const send = (status: number, body: unknown) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
  const path = (request.url ?? "").split("?")[0].replace(/^\/api\/v1/, "");
  const user = /__Host-vws_session=([^;]+)/.exec(request.headers.cookie ?? "")?.[1];
  if (path === "/healthz") return send(200, { status: "ok" });
  if (!user) return send(401, { error: { code: "Unauthenticated", message: "Sign in." } });
  const principal = `arn:vws:iam::123456789012:user/${user}`;
  if (path === "/auth/session") return send(200, { loginEnabled: true, principal, account: "123456789012" });
  if (path === "/admin/permissions") {
    return user === "root" ? send(200, { permissions: ["vws:AdminListRegions"] }) : send(403, { permissions: [] });
  }
  if (path.startsWith("/admin/") && user !== "root") return send(403, denied);
  return send(200, { items: [] });
}).listen(Number(process.env.FAKE_API_PORT ?? 43321), "127.0.0.1");
