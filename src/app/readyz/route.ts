import { checkReadiness } from "@/lib/ops/readiness";

// Kubernetes readiness probe: per request, never cached, never behind sign-in (see proxy.ts).
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const readiness = await checkReadiness();
  return Response.json(
    { status: readiness.ready ? "ok" : "unavailable", checks: readiness.checks },
    { status: readiness.ready ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
