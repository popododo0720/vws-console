"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { computeNav } from "@/lib/console-data";
import { ApiErrorAlert, OperationStatus, useApiAction } from "@/components/sites/console/api-action";
import { renameInstanceAction } from "@/app/actions/resources";
import type { ApiError } from "@/lib/vws-api/adapter";
import type { Instance } from "@/types/console";
import { useConsole } from "@/components/sites/console/console-provider";
import { InstanceDetails, InstanceTab, instanceTabs } from "@/components/sites/console/instance-detail";
import { InstanceStateMenu } from "@/components/sites/console/instance-state-menu";
import { PageHeader } from "@/components/sites/console/page-header";
import { Shell } from "@/components/sites/console/shell";
import {
  ActionLink,
  FieldLabel,
  MenuButton,
  OrangeButton,
  OutlineButton,
  PanelDialog,
  blueMenuTriggerClass,
  menuTriggerClass,
} from "@/components/sites/console/ui";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { OPEN_CONSOLE, connectHref } from "@/lib/instance-console";

export function InstanceDetailView({
  id,
  instance,
  loadError,
}: {
  id: string;
  instance: Instance | null;
  loadError: ApiError | null;
}) {
  const action = useApiAction();
  const { terminatedVisible } = useConsole();
  const [tab, setTab] = useState("details");
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState("");

  if (loadError) {
    return (
      <Shell tree={computeNav}>
        <PageHeader
          crumbs={[
            { label: "EC2", href: "/compute/instances" },
            { label: "Instances", href: "/compute/instances" },
            { label: id },
          ]}
        />
        <ApiErrorAlert error={loadError} title="The instance could not be loaded" />
      </Shell>
    );
  }

  // A region that keeps no terminated instance answers NotFound for one; a record it still sent is treated alike.
  if (!instance || (instance.state === "terminated" && !terminatedVisible)) {
    return (
      <Shell tree={computeNav}>
        <PageHeader
          crumbs={[
            { label: "EC2", href: "/compute/instances" },
            { label: "Instances", href: "/compute/instances" },
            { label: id },
          ]}
        />
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
        title={`Instance summary for ${label}`}
        info="A single instance in the current region, read from the VWS API."
        actions={
          <>
            <button
              type="button"
              aria-label="Refresh instance"
              className="grid size-8 place-items-center rounded-full border border-[#006ce0] text-[#006ce0] hover:bg-[#f2f8fd]"
              onClick={action.refresh}
            >
              <RefreshCw className="size-3.5" />
            </button>
            <ActionLink action={OPEN_CONSOLE} href={connectHref(instance.id)} className={menuTriggerClass()}>
              Connect
            </ActionLink>
            <InstanceStateMenu instances={[instance]} action={action} />
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
                  label: "Edit Name tag",
                  action: "ec2:CreateTags",
                  onSelect: () => {
                    setNewName(instance.name);
                    setRenameOpen(true);
                  },
                },
                {
                  label: "Copy instance ID",
                  onSelect: () => void copyToClipboard(instance.id, "instance-detail-view"),
                },
              ]}
            />
          </>
        }
      />
      <ApiErrorAlert error={action.error} title="The instance action failed" />
      <OperationStatus operation={action.operation} />
      <PanelDialog
        open={renameOpen}
        title="Edit Name tag"
        onClose={() => setRenameOpen(false)}
        footer={
          <>
            <OutlineButton onClick={() => setRenameOpen(false)}>Cancel</OutlineButton>
            <OrangeButton
              disabled={action.pending || !newName.trim()}
              onClick={() =>
                action.run(
                  () => renameInstanceAction(instance.id, newName),
                  () => setRenameOpen(false),
                )
              }
            >
              Save
            </OrangeButton>
          </>
        }
      >
        <FieldLabel>Name</FieldLabel>
        <input
          className="field"
          aria-label="Instance name"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <p className="mt-1 text-[12px] text-[#5f6b7a]">
          Saved as the Name tag. The VWS API cannot remove a tag yet, so a name cannot be cleared.
        </p>
      </PanelDialog>
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-6">
        <section className="rounded-lg border border-[#d5dbdb] p-4">
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
