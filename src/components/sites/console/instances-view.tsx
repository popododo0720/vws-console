"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleCheck, Info } from "lucide-react";
import type { Instance } from "@/types/console";
import { computeNav } from "@/lib/console-data";
import { useConsole } from "@/components/sites/console/console-provider";
import { DetailDock } from "@/components/sites/console/detail-dock";
import { PageHeader } from "@/components/sites/console/page-header";
import { Column, NameCell, ResourceTable } from "@/components/sites/console/resource-table";
import { Shell } from "@/components/sites/console/shell";
import {
  CopyText,
  MenuButton,
  MenuChevron,
  OrangeButton,
  OutlineButton,
  PanelDialog,
  dash,
  menuTriggerClass,
  orangeLinkClass,
} from "@/components/sites/console/ui";

const stateMeta: Record<Instance["state"], { label: string; color: string }> = {
  running: { label: "Running", color: "#037f0c" },
  stopped: { label: "Stopped", color: "#d13212" },
  pending: { label: "Pending", color: "#006ce0" },
  stopping: { label: "Stopping", color: "#d13212" },
};

function StateCell({ state }: { state: Instance["state"] }) {
  const meta = stateMeta[state];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

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

export function InstancesView() {
  const api = useConsole();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dock, setDock] = useState(300);
  const [updated, setUpdated] = useState("Last updated less than a minute ago");
  const [connectOpen, setConnectOpen] = useState(false);
  const [panel, setPanel] = useState("details");
  const instanceTabs = [
    { id: "details", label: "Details" },
    { id: "alarms", label: "Status and alarms" },
    { id: "monitoring", label: "Monitoring" },
    { id: "security", label: "Security" },
    { id: "networking", label: "Networking" },
    { id: "storage", label: "Storage" },
    { id: "tags", label: "Tags" },
  ];
  const selected = api.instances.filter((item) => selectedIds.includes(item.id));
  const one = selected.length === 1 ? selected[0] : null;

  const columns: Column<Instance>[] = [
    {
      key: "name",
      header: "Name",
      minWidth: 160,
      sortValue: (row) => row.name,
      cell: (row) => <NameCell value={row.name} onRename={(name) => api.renameInstance(row.id, name)} />,
    },
    { key: "id", header: "Instance ID", minWidth: 180, sortValue: (row) => row.id, cell: (row) => <CopyText value={row.id} /> },
    { key: "state", header: "Instance state", minWidth: 140, sortValue: (row) => row.state, cell: (row) => <StateCell state={row.state} /> },
    { key: "type", header: "Instance type", minWidth: 120, sortValue: (row) => row.type, cell: (row) => row.type },
    { key: "status", header: "Status check", minWidth: 170, sortValue: (row) => row.status, cell: (row) => <StatusCell row={row} /> },
    { key: "az", header: "Availability Zone", minWidth: 150, sortValue: (row) => row.availabilityZone, cell: (row) => row.availabilityZone },
    { key: "dns", header: "Public IPv4 DNS", minWidth: 200, sortValue: (row) => row.publicDns, cell: (row) => dash(row.publicDns) },
    { key: "ip", header: "Public IPv4 address", minWidth: 150, sortValue: (row) => row.publicIpv4, cell: (row) => dash(row.publicIpv4) },
    { key: "eip", header: "Elastic IP", minWidth: 120, sortValue: (row) => row.elasticIp, cell: (row) => dash(row.elasticIp) },
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
        info="Instances are virtual machines in the current region. This list is local sample data."
        meta={updated}
        actions={
          <>
            <OutlineButton disabled={selected.length === 0} onClick={() => setConnectOpen(true)}>
              Connect
            </OutlineButton>
            <MenuButton
              className={menuTriggerClass()}
              label={
                <>
                  Instance state <MenuChevron />
                </>
              }
              items={[
                {
                  label: "Start",
                  disabled: selected.every((item) => item.state === "running"),
                  onSelect: () => api.setInstanceState(selected.map((item) => item.id), "running"),
                },
                {
                  label: "Stop",
                  disabled: selected.every((item) => item.state !== "running"),
                  onSelect: () => api.setInstanceState(selected.map((item) => item.id), "stopped"),
                },
                {
                  label: "Terminate",
                  disabled: selected.length === 0,
                  onSelect: () => api.terminateInstances(selected.map((item) => item.id)),
                },
              ]}
            />
            <MenuButton
              className={menuTriggerClass()}
              label={
                <>
                  Actions <MenuChevron />
                </>
              }
              items={[
                {
                  label: "Copy instance ID",
                  disabled: !one,
                  onSelect: () => {
                    if (one) void navigator.clipboard.writeText(one.id);
                  },
                },
                {
                  label: "Rename is on the name pencil",
                  disabled: true,
                },
              ]}
            />
            <Link href="/compute/launch" className={orangeLinkClass}>
              Launch instances
            </Link>
          </>
        }
      />
      <ResourceTable
        rows={api.instances}
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
        onRefresh={() => setUpdated("Last updated less than a minute ago")}
      />
      <DetailDock
        title={one ? one.name || one.id : selected.length > 1 ? `${selected.length} instances` : "All instances"}
        info="Alarm, health, and event summaries for the current region."
        tabs={one ? instanceTabs : undefined}
        tab={panel}
        onTab={setPanel}
        height={dock}
        onHeight={setDock}
      >
        {one ? (
          panel === "details" ? (
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
              {[
                ["Instance ID", one.id],
                ["State", stateMeta[one.state].label],
                ["Type", one.type],
                ["Zone", one.availabilityZone],
                ["Public IPv4", dash(one.publicIpv4)],
                ["VPC", dash(one.vpcId)],
                ["Key pair", dash(one.keyPair)],
                ["Image", one.imageId],
                ["Launched", one.launchedAt],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[12px] text-[#5f6b7a]">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <InstancePanel tab={panel} instance={one} />
          )
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

function InstancePanel({ tab, instance }: { tab: string; instance: Instance }) {
  if (tab === "alarms") {
    return <p className="text-[13px]">Status check: {instance.status}. {instance.checksPassed}/{instance.checksTotal} checks passed.</p>;
  }
  if (tab === "monitoring") return <p className="text-[13px] text-[#5f6b7a]">No metric series is stored for this instance.</p>;
  if (tab === "security") return <p className="text-[13px]">Security groups: {instance.securityGroupIds.join(", ") || "—"}</p>;
  if (tab === "networking") {
    return <p className="text-[13px]">Public DNS {dash(instance.publicDns)} · IPv4 {dash(instance.publicIpv4)} · VPC {dash(instance.vpcId)}</p>;
  }
  if (tab === "storage") return <p className="text-[13px] text-[#5f6b7a]">The root volume is listed on the Volumes page.</p>;
  return <p className="text-[13px]">Name = {instance.name || "—"}</p>;
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
