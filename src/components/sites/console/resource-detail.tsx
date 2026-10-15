"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { NavTree } from "@/types/console";
import type { ApiError } from "@/lib/vws-api/adapter";
import { ApiErrorAlert } from "@/components/sites/console/api-action";
import { PageHeader } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import { DetailGrid } from "@/components/sites/console/ui";

export function DetailLink({ href, id }: { href: string; id: string }) {
  return (
    <Link href={href} className="text-[#006ce0] hover:underline" onClick={(event) => event.stopPropagation()}>
      {id}
    </Link>
  );
}

/** A single-resource page read from a console-api detail endpoint. */
export function ResourceDetail({
  tree,
  crumbs,
  kind,
  id,
  backHref,
  found,
  loadError,
  items,
  children,
}: {
  tree: NavTree;
  crumbs: { label: string; href?: string }[];
  kind: string;
  id: string;
  backHref: string;
  found: boolean;
  loadError: ApiError | null;
  items: [string, ReactNode][];
  children?: ReactNode;
}) {
  return (
    <Shell tree={tree}>
      <PageHeader
        crumbs={[...crumbs, { label: id }]}
        info={`A single ${kind} in the current region, read from the VWS API.`}
      />
      <ApiErrorAlert error={loadError} title={`The ${kind} could not be loaded`} />
      {!loadError && !found ? (
        <div className="px-4 py-6 text-[13px]">
          <p className="font-semibold">{kind.charAt(0).toUpperCase() + kind.slice(1)} not found</p>
          <p className="mt-1 text-[#5f6b7a]">{id} is not in this region.</p>
          <Link href={backHref} className="mt-3 inline-block text-[#006ce0] hover:underline">
            Back
          </Link>
        </div>
      ) : null}
      {found ? (
        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 pb-6 text-[13px]">
          <section className="rounded-lg border border-[#d5dbdb] p-4">
            <h2 className="mb-3 text-[16px] font-semibold">Details</h2>
            <DetailGrid items={items} />
          </section>
          {children}
        </div>
      ) : null}
    </Shell>
  );
}
