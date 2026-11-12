"use client";

import { copyToClipboard } from "@/lib/clipboard";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { CircleCheck, ExternalLink, RefreshCw } from "lucide-react";
import type { Instance } from "@/types/console";
import { computeNav } from "@/lib/console-data";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import {
  renameInstanceAction,
  startInstancesAction,
  stopInstancesAction,
  terminateInstancesAction,
} from "@/app/actions/resources";
import type { ApiError } from "@/lib/vws-api/adapter";
import { DetailDock } from "@/components/sites/console/detail-dock";
import { PageHeader } from "@/components/sites/console/page-header";
import { Column, NameCell, ResourceTable } from "@/components/sites/console/resource-table";
import { InstanceLink, InstanceTab, StateDot, instanceTabs } from "@/components/sites/console/instance-detail";
import { Shell } from "@/components/sites/console/shell";
import {
  MenuButton,
  OrangeButton,
  OutlineButton,
  PanelDialog,
  dash,
  blueMenuTriggerClass,
  orangeLinkClass,
} from "@/components/sites/console/ui";

function StatusCell({ row }: { row: Instance }) {
  if (row.status === "none") return <span>—</span>;
  const color = row.status === "ok" ? "#037f0c" : row.status === "impaired" ? "#d13212" : "#5f6b7a";
  const label = row.status === "initializing" ? "Initializing" : `${row.checksPassed}/${row.checksTotal} checks passed`;
  return (
    <span className="inline-flex items-center gap-1" style={{ color }}>
      <CircleCheck className="size-3.5" />
      {label}
    </span>
  );
}

export function InstancesView({ instances, loadError }: { instances: Instance[]; loadError: ApiError | null }) {
  const action = useApiAction();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dock, setDock] = useState(300);
  const [connectOpen, setConnectOpen] = useState(false);
  const [panel, setPanel] = useState("details");
  const [loads, setLoads] = useState({ instances, count: 0 });
  if (loads.instances !== instances) setLoads({ instances, count: loads.count + 1 });
  const selected = instances.filter((item) => selectedIds.includes(item.id));
  const one = selected.length === 1 ? selected[0] : null;

  const columns: Column<Instance>[] = [
    {
      key: "name",
      header: "Name",
      minWidth: 160,
      sortValue: (row) => row.name,
      cell: (row) => (
        <NameCell
          value={row.name}
          onRename={(name) => {
            if (name !== row.name) action.run(() => renameInstanceAction(row.id, name));
          }}
        />
      ),
    },
    {
      key: "id",
      header: "Instance ID",
      minWidth: 180,
      sortValue: (row) => row.id,
      cell: (row) => <InstanceLink id={row.id} />,
    },
    {
      key: "state",
      header: "Instance state",
      minWidth: 140,
      sortValue: (row) => row.state,
      cell: (row) => <StateDot state={row.state} />,
    },
    { key: "type", header: "Instance type", minWidth: 120, sortValue: (row) => row.type, cell: (row) => row.type },
    {
      key: "status",
      header: "Status check",
      minWidth: 170,
      sortValue: (row) => row.status,
      cell: (row) => <StatusCell row={row} />,
    },
    {
      key: "az",
      header: "Availability Zone",
      minWidth: 150,
      sortValue: (row) => row.availabilityZone,
      cell: (row) => row.availabilityZone,
    },

    {
      key: "dns",
      header: "Public IPv4 DNS",
      minWidth: 200,
      sortValue: (row) => row.publicDns,
      cell: (row) => dash(row.publicDns),
    },
    {
      key: "ip",
      header: "Public IPv4 address",
      minWidth: 150,
      sortValue: (row) => row.publicIpv4,
      cell: (row) => dash(row.publicIpv4),
    },
    {
      key: "eip",
      header: "Elastic IP",
      minWidth: 120,
      sortValue: (row) => row.elasticIp,
      cell: (row) => dash(row.elasticIp),
    },

    { key: "ipv6", header: "IPv6 IPs", minWidth: 120, sortValue: (row) => row.ipv6, cell: (row) => dash(row.ipv6) },
    {
      key: "keyName",
      header: "Key name",
      minWidth: 140,
      sortValue: (row) => row.keyPair,
      cell: (row) => dash(row.keyPair),
    },
    {
      key: "launch",
      header: "Launch time",
      minWidth: 200,
      sortValue: (row) => row.launchedAt,
      cell: (row) => dash(row.launchedAt),
    },
    { key: "vpc", header: "VPC ID", minWidth: 190, sortValue: (row) => row.vpcId, cell: (row) => dash(row.vpcId) },
    {
      key: "eipalloc",
      header: "Elastic IP allocation ID",
      minWidth: 210,
      sortValue: (row) => row.publicIpAllocationId,
      cell: (row) => dash(row.publicIpAllocationId),
    },
  ];

  return (
    <Shell tree={computeNav}>
      <PageHeader
        mark="C"
        crumbs={[{ label: "EC2", href: "/compute/instances" }, { label: "Instances" }]}
        info="Instances are virtual machines in the current region, read from the VWS API."
        actions={
          <>
            {loadError ? null : <LastUpdated key={loads.count} />}
            <button
              type="button"
              aria-label="Refresh instances"
              className="grid size-8 place-items-center rounded-full border border-[#006ce0] text-[#006ce0] hover:bg-[#f2f8fd]"
              onClick={() => {
                setSelectedIds([]);
                action.refresh();
              }}
            >
              <RefreshCw className="size-3.5" />
            </button>
            <OutlineButton disabled={selected.length === 0} onClick={() => setConnectOpen(true)}>
              Connect <ExternalLink className="size-3" />
            </OutlineButton>
            <MenuButton
              className={blueMenuTriggerClass()}
              label={
                <>
                  Instance state{" "}
                  <span aria-hidden className="text-[9px]">
                    ▼
                  </span>
                </>
              }
              items={[
                {
                  label: "Start",
                  disabled: action.pending || selected.every((item) => item.state !== "stopped"),
                  onSelect: () => action.run(() => startInstancesAction(selected.map((item) => item.id))),
                },
                {
                  label: "Stop",
                  disabled: action.pending || selected.every((item) => item.state !== "running"),
                  onSelect: () => action.run(() => stopInstancesAction(selected.map((item) => item.id))),
                },
                {
                  label: "Terminate",
                  disabled: action.pending || selected.length === 0,
                  onSelect: () =>
                    action.run(
                      () => terminateInstancesAction(selected.map((item) => item.id)),
                      () => setSelectedIds([]),
                    ),
                },
              ]}
            />
            <MenuButton
              className={blueMenuTriggerClass()}
              label={
                <>
                  Actions{" "}
                  <span aria-hidden className="text-[9px]">
                    ▼
                  </span>
                </>
              }
              items={[
                {
                  label: "Copy instance ID",
                  disabled: !one,
                  onSelect: () => {
                    if (one) void copyToClipboard(one.id, "instances-view");
                  },
                },
                {
                  label: "View details",
                  disabled: !one,
                  href: one ? `/compute/instances/${one.id}` : undefined,
                },
              ]}
            />
            <div className="flex">
              <Link href="/compute/launch" className={`${orangeLinkClass} rounded-r-none`}>
                Launch instances
              </Link>
              <MenuButton
                align="right"
                className="inline-flex h-8 items-center rounded-r-lg border-l border-[#16191f]/30 bg-[#ff9900] px-2 text-[#16191f] hover:bg-[#ec7211]"
                label={
                  <span aria-label="More launch options" className="text-[9px]">
                    ▼
                  </span>
                }
                items={[
                  { label: "Launch instances", href: "/compute/launch" },
                  { label: "Launch instance from template", disabled: true },
                ]}
              />
            </div>
          </>
        }
      />
      <ApiErrorAlert error={loadError} title="Instances could not be loaded" />
      <ApiErrorAlert error={action.error} title="The instance action failed" />
      <ResourceTable
        hideRefresh
        rows={instances}
        region={(row) => row.region}
        getId={(row) => row.id}
        columns={columns}
        selectedIds={selected.map((item) => item.id)}
        onSelectedIds={setSelectedIds}
        emptyTitle="No instances"
        emptyMessage="You do not have any instances in this region"
        emptyAction={{ label: "Launch instances", href: "/compute/launch" }}
        filterPlaceholder="Filter Instance by attribute or tag (case-sensitive)"
        presets={[
          { id: "running", label: "Running", match: (row) => row.state === "running" },
          { id: "stopped", label: "Stopped", match: (row) => row.state === "stopped" },
        ]}
      />
      <DetailDock
        title={
          one
            ? one.name
              ? `${one.id} (${one.name})`
              : one.id
            : selected.length > 1
              ? `${selected.length} instances`
              : "All instances"
        }
        tabs={one ? instanceTabs : undefined}
        tab={panel}
        onTab={setPanel}
        height={dock}
        onHeight={setDock}
      >
        {one ? (
          <InstanceTab tab={panel} instance={one} />
        ) : selected.length > 1 ? (
          <p className="text-[13px] text-[#5f6b7a]">Select a single instance to see its details.</p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            <StatusCard title="Instance alarm states" link="View in CloudWatch">
              <StatusFact label="In alarm" value={loadError ? null : "None"} />
            </StatusCard>
            <StatusCard title="Service health" link="View Service Health Dashboard">
              <StatusFact label="EC2 service status" value={loadError ? null : "Operating normally"} />
            </StatusCard>
            <StatusCard title="Health events affecting EC2 instances" link="View VWS Health Dashboard">
              <div className="grid grid-cols-2 divide-x divide-[#e6e8eb]">
                <StatusFact label="Open events" value={loadError ? null : "None"} />
                <div className="pl-5">
                  <StatusFact label="Upcoming events" value={loadError ? null : "None"} />
                </div>
              </div>
            </StatusCard>
          </div>
        )}
      </DetailDock>
      <PanelDialog
        open={connectOpen}
        title="Connect"
        onClose={() => setConnectOpen(false)}
        footer={<OrangeButton onClick={() => setConnectOpen(false)}>Close</OrangeButton>}
      >
        <p>
          {one?.state === "running"
            ? `A serial session is not connected for ${one.id}.`
            : "Select one running instance to connect."}
        </p>
      </PanelDialog>
    </Shell>
  );
}

function StatusCard({ title, link, children }: { title: string; link: string; children: ReactNode }) {
  return (
    <article className="flex flex-col rounded-2xl border border-[#c6c9ce]">
      <div className="flex-1 px-5 pb-4 pt-5">
        <h3 className="mb-4 text-[18px] font-bold">{title}</h3>
        {children}
      </div>
      <span className="flex items-center gap-1 border-t border-[#e6e8eb] px-5 py-4 text-[13px] text-[#8d9aa8]">
        {link} <ExternalLink className="size-3" />
      </span>
    </article>
  );
}

function StatusFact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="text-[13px]">
      <p className="font-semibold">{label}</p>
      {value ? (
        <p className="flex items-center gap-1 text-[#037f0c]">
          <CircleCheck className="size-3.5" />
          {value}
        </p>
      ) : (
        <p className="text-[#5f6b7a]">Unavailable</p>
      )}
    </div>
  );
}

export function elapsedLabel(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "less than a minute ago";
  if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}

function LastUpdated() {
  const [loadedAt] = useState(() => Date.now());
  const [now, setNow] = useState(loadedAt);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <span className="text-right text-[12px] leading-4 text-[#5f6b7a]">
      Last updated
      <br />
      {elapsedLabel(now - loadedAt)}
    </span>
  );
}
