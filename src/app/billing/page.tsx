import type { Metadata } from "next";
import { connection } from "next/server";
import { UsageView } from "@/components/sites/console/usage-view";
import { WINDOW_RULE, lastMonths, usageWindow } from "@/lib/usage";
import { getUsage } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Billing and Cost Management · VWS" };

type Query = Promise<{ [key: string]: string | string[] | undefined }>;

/** With no from and to in the URL the page reads the last six months, the range AWS cost widgets open with. */
export default async function Page({ searchParams }: { searchParams: Query }) {
  await connection();
  const { from, to } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const range = from === undefined && to === undefined ? lastMonths(today, 6) : usageWindow(from, to);
  if (!range) {
    const refused = { code: "InvalidArgument", message: WINDOW_RULE, requestId: null };
    return <UsageView today={today} range={null} report={null} loadError={refused} />;
  }
  const usage = await getUsage(range);
  return (
    <UsageView
      today={today}
      range={range}
      report={usage.ok ? usage.value : null}
      loadError={usage.ok ? null : usage.error}
    />
  );
}
