"use client";

import { copyToClipboard } from "@/lib/clipboard";
import { useState } from "react";
import Link from "next/link";
import { CircleCheck, ExternalLink, Info, RefreshCw } from "lucide-react";
import type { Instance } from "@/types/console";
import { computeNav } from "@/lib/console-data";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { renameInstanceAction, startInstancesAction, stopInstancesAction, terminateInstancesAction } from "@/app/actions/resources";
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
  const label =
    row.status === "initializing" ? "Initializing" : `${row.checksPassed}/${row.checksTotal} checks passed`;
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
    { key: "id", header: "Instance ID", minWidth: 180, sortValue: (row) => row.id, cell: (row) => <InstanceLink id={row.id} /> },
    { key: "state", header: "Instance state", minWidth: 140, sortValue: (row) => row.state, cell: (row) => <StateDot state={row.state} /> },
    { key: "type", header: "Instance type", minWidth: 120, sortValue: (row) => row.type, cell: (row) => row.type },
    { key: "status", header: "Status check", minWidth: 170, sortValue: (row) => row.status, cell: (row) => <StatusCell row={row} /> },
    { key: "az", header: "Availability Zone", minWidth: 150, sortValue: (row) => row.availabilityZone, cell: (row) => row.availabilityZone },
    { key: "vpc", header: "VPC ID", minWidth: 190, sortValue: (row) => row.vpcId, cell: (row) => dash(row.vpcId) },
    { key: "launch", header: "Launch time", minWidth: 200, sortValue: (row) => row.launchedAt, cell: (row) => dash(row.launchedAt) },
    { key: "dns", header: "Public IPv4 DNS", minWidth: 200, sortValue: (row) => row.publicDns, cell: (row) => dash(row.publicDns) },
    { key: "ip", header: "Public IPv4 address", minWidth: 150, sortValue: (row) => row.publicIpv4, cell: (row) => dash(row.publicIpv4) },
    { key: "eip", header: "Elastic IP", minWidth: 120, sortValue: (row) => row.elasticIp, cell: (row) => dash(row.elasticIp) },
    { key: "eipalloc", header: "Elastic IP allocation ID", minWidth: 210, sortValue: (row) => row.publicIpAllocationId, cell: (row) => dash(row.publicIpAllocationId) },
    { key: "ipv6", header: "IPv6 IPs", minWidth: 120, sortValue: (row) => row.ipv6, cell: (row) => dash(row.ipv6) },
  ];

  return (
    <Shell tree={computeNav}>
      <PageHeader
        mark="C"
        crumbs={[
          { label: "EC2", href: "/compute/instances" },
          { label: "Instances" },
        ]}
        info="Instances are virtual machines in the current region, read from the VWS API."
        actions={
          <>
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
                  Instance state <span aria-hidden className="text-[9px]">▼</span>
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
                  onSelect: () => action.run(() => terminateInstancesAction(selected.map((item) => item.id)), () => setSelectedIds([])),
                },
              ]}
            />
            <MenuButton
              className={blueMenuTriggerClass()}
              label={
                <>
                  Actions <span aria-hidden className="text-[9px]">▼</span>
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
                label={<span aria-label="More launch options" className="text-[9px]">▼</span>}
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
        getId={(row) => row.id}
        columns={columns}
        selectedIds={selected.map((item) => item.id)}
        onSelectedIds={setSelectedIds}
        emptyTitle="No instances"
        emptyMessage="You do not have any instances in this region"
        emptyAction={{ label: "Launch instances", href: "/compute/launch" }}
        filterPlaceholder="Filter instances by attribute or tag (case-sensitive)"
        presets={[
          { id: "running", label: "Running", match: (row) => row.state === "running" },
          { id: "stopped", label: "Stopped", match: (row) => row.state === "stopped" },
        ]}
      />
      <DetailDock
        title={one ? (one.name ? `${one.id} (${one.name})` : one.id) : selected.length > 1 ? `${selected.length} instances` : "All instances"}
        info="Alarm, health, and event summaries for the current region."
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
          <div className="grid gap-3 lg:grid-cols-3">
            <StatusCard title="Instance alarm states" body="No alarms for this region." link="View metrics" />
            <StatusCard title="Service health" body="All listed services are operating normally." link="View service status" />
            <StatusCard title="Health events affecting instances" body="No health events." link="View health events" />
          </div>
        )}
      </DetailDock>
      <PanelDialog open={connectOpen} title="Connect" onClose={() => setConnectOpen(false)}
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

function StatusCard({ title, body, link }: { title: string; body: string; link: string }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="flex min-h-36 flex-col rounded-lg border border-[#e6e8eb]">
      <div className="flex-1 p-3">
        <h3 className="flex items-center gap-1 text-[14px] font-semibold">
          {title}
          <button
            type="button"
            aria-label={`About ${title}`}
            className="text-[#006ce0]"
            onClick={() => setOpen((value) => !value)}
          >
            <Info className="size-3.5" />
          </button>
        </h3>
        <p className="mt-2 text-[13px] text-[#5f6b7a]">{open ? `${body} Metrics stay inside this preview.` : body}</p>
      </div>
      <button
        type="button"
        className="border-t border-[#e6e8eb] px-3 py-2 text-left text-[13px] text-[#006ce0] hover:underline"
        onClick={() => setOpen((value) => !value)}
      >
        {link}
      </button>
    </article>
  );
}
