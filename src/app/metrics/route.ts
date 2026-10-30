import { consoleMetrics } from "@/lib/ops/metrics";

// Prometheus scrape target: always rendered per request, never cached, never behind sign-in (see proxy.ts).
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { registry } = consoleMetrics();
  return new Response(await registry.metrics(), {
    status: 200,
    headers: { "content-type": registry.contentType, "cache-control": "no-store" },
  });
}
