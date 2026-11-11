"use client";

import { useState, type ReactNode } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import { ADMIN_REGIONS_ACTION, adminNav } from "@/lib/console-data";
import type { AdminRegionHealth, ApiError } from "@/lib/vws-api/adapter";
import { cn } from "@/lib/utils";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { RefreshIconButton } from "@/components/sites/console/ebs-form-parts";
import { PageHeader } from "@/components/sites/console/page-header";
import { DetailLink } from "@/components/sites/console/resource-detail";
import { ResourceTable, type Column } from "@/components/sites/console/resource-table";
import { Shell } from "@/components/sites/console/shell";
import { dash } from "@/components/sites/console/ui";

export const adminCrumb = { label: "Administration", href: "/admin/regions" };

/** One list row: a registered Proxmox cluster, or a region an AWS account may use. AWS has no health reading. */
export type RegionRow = {
  id: string;
  name: string;
  type: "Proxmox" | "AWS";
  clusterName: string;
  accountId: string;
  health: AdminRegionHealth | null;
};

/** A value with the AWS status icon, a green check or a red cross; with no verdict it is plain text or a dash. */
export function StatusText({ ok, text }: { ok: boolean | null; text: string }) {
  if (ok === null) return dash(text);
  const Icon = ok ? CircleCheck : CircleX;
  return (
    <span className={cn("flex items-center gap-1", ok ? "text-[#037f0c]" : "text-[#d13212]")}>
      <Icon className="size-3.5" />
      {text}
    </span>
  );
}

const statusLabels = { ok: "Available", unreachable: "Unreachable", unknown: "Unknown" };

/**
 * The health fields as [label, text, cell], shared by the list columns and the detail page so both use one wording.
 * Quorum, leader and the node count are shown only from a reading console-api got from the region itself.
 */
export function healthFields(health: AdminRegionHealth | null): [string, string, ReactNode][] {
  const read = health?.status === "ok" ? health : null;
  const status = health ? statusLabels[health.status] : "";
  const reached = health && health.status !== "unknown" ? health.status === "ok" : null;
  const quorum = read ? (read.quorate ? "Quorate" : "No quorum") : "";
  const online = read ? `${read.nodes.filter((node) => node.online).length}/${read.nodes.length}` : "";
  const lastError = health?.lastError?.message ?? "";
  return [
    ["Status", status, <StatusText key="status" ok={reached} text={status} />],
    ["Quorum", quorum, <StatusText key="quorum" ok={read ? read.quorate : null} text={quorum} />],
    ["Leader", read?.leader ?? "", dash(read?.leader ?? "")],
    ["Online nodes", online, dash(online)],
    ["Last error", lastError, dash(lastError)],
  ];
}

const textColumn = (key: "type" | "clusterName" | "accountId", header: string): Column<RegionRow> => ({
  key,
  header,
  minWidth: 130,
  sortValue: (row) => row[key],
  cell: (row) => dash(row[key]),
});

const healthColumns = healthFields(null).map(([header], index): Column<RegionRow> => ({
  key: header,
  header,
  minWidth: 130,
  sortValue: (row) => healthFields(row.health)[index][1],
  cell: (row) => healthFields(row.health)[index][2],
}));

/** Last error goes last: it is free text of any length, and the table scrolls sideways past what does not fit. */
const columns: Column<RegionRow>[] = [
  {
    key: "name",
    header: "Region name",
    minWidth: 180,
    sortValue: (row) => row.name,
    cell: (row) =>
      row.type === "Proxmox" ? (
        <DetailLink href={`/admin/regions/${encodeURIComponent(row.name)}`} id={row.name} />
      ) : (
        row.name
      ),
  },
  textColumn("type", "Type"),
  ...healthColumns.slice(0, 4),
  textColumn("clusterName", "Cluster name"),
  textColumn("accountId", "AWS account ID"),
  healthColumns[4],
];

export function AdminRegionsView({
  rows,
  regionsError,
  accountsError,
}: {
  rows: RegionRow[];
  regionsError: ApiError | null;
  accountsError: ApiError | null;
}) {
  const action = useApiAction();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const failed = Boolean(regionsError || accountsError);
  return (
    <Shell tree={adminNav}>
      <PageHeader
        crumbs={[adminCrumb, { label: "Regions" }]}
        count={failed ? undefined : rows.length}
        info="Regions are the Proxmox clusters and the AWS account regions registered with this console."
        actions={<RefreshIconButton label="Refresh regions" onClick={action.refresh} />}
      />
      <ApiErrorAlert error={regionsError} title="Proxmox regions could not be loaded" />
      <ApiErrorAlert error={accountsError} title="AWS account regions could not be loaded" />
      <ResourceTable
        rows={rows}
        getId={(row) => row.id}
        columns={columns}
        selectedIds={selectedIds}
        onSelectedIds={setSelectedIds}
        emptyTitle=""
        emptyMessage={failed ? "" : "No regions found"}
        filterPlaceholder="Search"
        initialSort={{ key: "name", dir: "asc" }}
        variant="aws-list"
      />
    </Shell>
  );
}

/** The AWS console's access-denied alert, in place of an operator screen console-api refuses the caller. */
export function AdminAccessDenied({ error }: { error: ApiError }) {
  const message = `You don't have permission to ${ADMIN_REGIONS_ACTION}. To request access, send this action name and the request ID below to your VWS administrator.`;
  return (
    <Shell tree={null}>
      <PageHeader crumbs={[{ label: "Administration" }, { label: "Regions" }]} />
      <ApiErrorAlert error={{ ...error, message }} title="Access denied" />
    </Shell>
  );
}
