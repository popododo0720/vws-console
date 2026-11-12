import type { Metadata } from "next";
import { connection } from "next/server";
import { InstanceConnectView } from "@/components/sites/console/instance-connect-view";
import { isInstanceId, type ApiError } from "@/lib/vws-api/adapter";
import { getInstance } from "@/lib/vws-api/client";

export const metadata: Metadata = { title: "Connect to instance · VWS" };

const INVALID_ID: ApiError = {
  code: "InvalidParameterValue",
  message: "The instance ID is not valid.",
  requestId: null,
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const result = isInstanceId(id) ? await getInstance(id) : { ok: false as const, error: INVALID_ID };
  return (
    <InstanceConnectView
      id={id}
      instance={result.ok ? result.value : null}
      loadError={result.ok ? null : result.error}
    />
  );
}
