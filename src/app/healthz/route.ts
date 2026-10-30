// Kubernetes liveness probe: the process serves requests. It checks no dependency on purpose, so a
// console-api outage never restarts the console. Never cached, never behind sign-in (see proxy.ts).
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ status: "ok" }, { status: 200, headers: { "cache-control": "no-store" } });
}
