"use client";

import { useState } from "react";
import Link from "next/link";
import { computeNav } from "@/lib/console-data";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { renameInstanceAction, startInstancesAction, stopInstancesAction, terminateInstancesAction } from "@/app/actions/resources";
import type { ApiError } from "@/lib/vws-api/adapter";
import type { Instance } from "@/types/console";
import { InstanceDetails, InstanceTab, instanceTabs } from "@/components/sites/console/instance-detail";
import { PageHeader } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import { FieldLabel, MenuButton, OrangeButton, OutlineButton, PanelDialog, blueMenuTriggerClass } from "@/components/sites/console/ui";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";

export function InstanceDetailView({ id, instance, loadError }: { id: string; instance: Instance | null; loadError: ApiError | null }) {
  const action = useApiAction();
  const [tab, setTab] = useState("details");
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState("");

  if (loadError) {
    return (
      <Shell tree={computeNav}>
        <PageHeader crumbs={[{ label: "EC2", href: "/compute/instances" }, { label: "Instances", href: "/compute/instances" }, { label: id }]} />
        <ApiErrorAlert error={loadError} title="The instance could not be loaded" />
      </Shell>
    );
  }

  if (!instance) {
    return (
      <Shell tree={computeNav}>
        <PageHeader crumbs={[{ label: "EC2", href: "/compute/instances" }, { label: "Instances", href: "/compute/instances" }, { label: id }]} />
        <div className="px-4 py-6 text-[13px]">
          <p className="font-semibold">Instance not found</p>
          <p className="mt-1 text-[#5f6b7a]">{id} is not in this region.</p>
          <Link href="/compute/instances" className="mt-3 inline-block text-[#006ce0] hover:underline">
            Back to instances
          </Link>
        </div>
      </Shell>
    );
  }

  const label = instance.name ? `${instance.id} (${instance.name})` : instance.id;
  return (
    <Shell tree={computeNav}>
      <PageHeader
        crumbs={[
          { label: "EC2", href: "/compute/instances" },
          { label: "Instances", href: "/compute/instances" },
          { label },
        ]}
        info="A single instance in the current region, read from the VWS API."
        actions={
          <>
            <OutlineButton>Connect</OutlineButton>
            <MenuButton
              className={blueMenuTriggerClass()}
              label={<>Instance state <span aria-hidden className="text-[9px]">▼</span></>}
              items={[
                { label: "Start", disabled: action.pending || instance.state !== "stopped", onSelect: () => action.run(() => startInstancesAction([instance.id])) },
                { label: "Stop", disabled: action.pending || instance.state !== "running", onSelect: () => action.run(() => stopInstancesAction([instance.id])) },
                { label: "Terminate", disabled: action.pending || instance.state === "terminated", onSelect: () => action.run(() => terminateInstancesAction([instance.id])) },
              ]}
            />
            <MenuButton
              className={blueMenuTriggerClass()}
              label={<>Actions <span aria-hidden className="text-[9px]">▼</span></>}
              items={[
                {
                  label: "Edit Name tag",
                  onSelect: () => {
                    setNewName(instance.name);
                    setRenameOpen(true);
                  },
                },
                { label: "Copy instance ID", onSelect: () => void copyToClipboard(instance.id, "instance-detail-view") },
              ]}
            />
          </>
        }
      />
      <ApiErrorAlert error={action.error} title="The instance action failed" />
      <PanelDialog
        open={renameOpen}
        title="Edit Name tag"
        onClose={() => setRenameOpen(false)}
        footer={
          <>
            <OutlineButton onClick={() => setRenameOpen(false)}>Cancel</OutlineButton>
            <OrangeButton
              disabled={action.pending || !newName.trim()}
              onClick={() => action.run(() => renameInstanceAction(instance.id, newName), () => setRenameOpen(false))}
            >
              Save
            </OrangeButton>
          </>
        }
      >
        <FieldLabel>Name</FieldLabel>
        <input className="field" aria-label="Instance name" value={newName} onChange={(event) => setNewName(event.target.value)} />
        <p className="mt-1 text-[12px] text-[#5f6b7a]">Saved as the Name tag. The VWS API cannot remove a tag yet, so a name cannot be cleared.</p>
      </PanelDialog>
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-6">
        <section className="rounded-lg border border-[#d5dbdb] p-4">
          <h2 className="mb-3 text-[16px] font-bold">Instance summary</h2>
          <InstanceDetails instance={instance} />
        </section>
        <div className="mt-4 flex gap-4 overflow-x-auto border-b border-[#e6e8eb] text-[13px]">
          {instanceTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "shrink-0 border-b-2 pb-2",
                tab === item.id ? "border-[#006ce0] font-semibold text-[#006ce0]" : "border-transparent text-[#5f6b7a]",
              )}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="pt-3">
          <InstanceTab tab={tab} instance={instance} hideSummary />
        </div>
      </div>
    </Shell>
  );
}
