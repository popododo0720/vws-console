"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { networkNav } from "@/lib/console-data";
import { useConsole } from "@/components/sites/console/console-provider";
import { DetailDock } from "@/components/sites/console/detail-dock";
import { PageHeader } from "@/components/sites/console/page-header";
import { Column, ResourceTable } from "@/components/sites/console/resource-table";
import { Shell } from "@/components/sites/console/shell";
import {
  MenuButton,
  MenuChevron,
  OrangeButton,
  SampleBadge,
  menuTriggerClass,
  type MenuEntry,
} from "@/components/sites/console/ui";

export type ListAction<T> = {
  label: string;
  disabled?: (selected: T[]) => boolean;
  onSelect: (selected: T[]) => void;
};

type Tab = { id: string; label: string };

export function NetworkList<T>({
  title,
  info,
  rows,
  getId,
  columns,
  actions,
  createLabel,
  onCreate,
  emptyTitle,
  emptyMessage,
  filterPlaceholder,
  detailTitle,
  detailTabs,
  renderDetail,
  vpcOf,
  children,
}: {
  title: string;
  info: string;
  rows: T[];
  getId: (row: T) => string;
  columns: Column<T>[];
  actions: ListAction<T>[];
  createLabel: string;
  onCreate: () => void;
  emptyTitle: string;
  emptyMessage: string;
  filterPlaceholder: string;
  detailTitle: (row: T) => string;
  detailTabs?: Tab[];
  renderDetail: (row: T, tab: string) => ReactNode;
  vpcOf?: (row: T) => string;
  children?: ReactNode;
}) {
  const api = useConsole();
  const initialVpc = useSearchParams().get("vpc") ?? "all";
  const [vpcFilter, setVpcFilter] = useState(initialVpc);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dock, setDock] = useState(240);
  const [tab, setTab] = useState(detailTabs?.[0]?.id ?? "details");
  const [updated, setUpdated] = useState("Last updated less than a minute ago");
  const visible = vpcOf && vpcFilter !== "all" ? rows.filter((row) => vpcOf(row) === vpcFilter) : rows;
  const selected = visible.filter((row) => selectedIds.includes(getId(row)));
  const one = selected.length === 1 ? selected[0] : null;
  const items: MenuEntry[] = actions.map((action) => ({
    label: action.label,
    disabled: action.disabled ? action.disabled(selected) : selected.length === 0,
    onSelect: () => {
      action.onSelect(selected);
      setSelectedIds([]);
    },
  }));

  return (
    <Shell
      tree={networkNav}
      navHeader={
        vpcOf ? (
          <label className="block text-[12px]">
            Filter by VPC
            <select className="field mt-1" value={vpcFilter} onChange={(event) => setVpcFilter(event.target.value)}>
              <option value="all">Choose a VPC</option>
              {api.vpcs.map((vpc) => (
                <option key={vpc.id} value={vpc.id}>
                  {vpc.name || vpc.id}
                </option>
              ))}
            </select>
          </label>
        ) : undefined
      }
    >
      <PageHeader
        mark="N"
        crumbs={[{ label: "VPC", href: "/network/vpcs" }, { label: `${title} (${visible.length})` }]}
        info={info}
        meta={
          <span className="inline-flex items-center gap-2">
            {api.mode === "sample" ? <SampleBadge /> : null}
            {updated}
          </span>
        }
        actions={
          <>
            <MenuButton
              className={menuTriggerClass()}
              label={
                <>
                  Actions <MenuChevron />
                </>
              }
              items={items}
            />
            <OrangeButton onClick={onCreate}>{createLabel}</OrangeButton>
          </>
        }
      />
      <ResourceTable
        rows={visible}
        getId={getId}
        columns={columns}
        selectedIds={selected.map(getId)}
        onSelectedIds={setSelectedIds}
        emptyTitle={emptyTitle}
        emptyMessage={emptyMessage}
        emptyAction={{ label: createLabel, onClick: onCreate }}
        filterPlaceholder={filterPlaceholder}
        onRefresh={() => setUpdated("Last updated less than a minute ago")}
      />
      <DetailDock
        title={one ? detailTitle(one) : "Select a resource"}
        tabs={one ? detailTabs : undefined}
        tab={tab}
        onTab={setTab}
        height={dock}
        onHeight={setDock}
      >
        {one ? (
          renderDetail(one, tab)
        ) : (
          <p className="py-6 text-center text-[13px] text-[#5f6b7a]">Select a resource above to see its details.</p>
        )}
      </DetailDock>
      {children}
    </Shell>
  );
}
