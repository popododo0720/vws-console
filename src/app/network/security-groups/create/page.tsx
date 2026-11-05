import type { Metadata } from "next";
import { connection } from "next/server";
import { SecurityGroupCreateView } from "@/components/sites/console/security-group-create-view";
import { listSecurityGroups, listVpcs } from "@/lib/vws-api/client";
import type { ApiError } from "@/lib/vws-api/adapter";
import type { SecurityGroup } from "@/types/console";

export const metadata: Metadata = { title: "Create security group · VWS" };

async function copySource(copy: string | undefined): Promise<{ source: SecurityGroup | null; error: ApiError | null }> {
  if (!copy) return { source: null, error: null };
  const result = await listSecurityGroups();
  if (!result.ok) return { source: null, error: result.error };
  const source = result.value.find((item) => item.id === copy) ?? null;
  return source
    ? { source, error: null }
    : {
        source: null,
        error: {
          code: "InvalidGroup.NotFound",
          message: `The security group '${copy}' does not exist`,
          requestId: null,
        },
      };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ copy?: string | string[] }> }) {
  await connection();
  const { copy } = await searchParams;
  const [vpcs, copied] = await Promise.all([listVpcs(), copySource(typeof copy === "string" ? copy : undefined)]);
  return (
    <SecurityGroupCreateView
      vpcs={vpcs.ok ? vpcs.value : []}
      loadError={vpcs.ok ? null : vpcs.error}
      source={copied.source}
      sourceError={copied.error}
    />
  );
}
