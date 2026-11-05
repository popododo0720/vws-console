"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { networkNav } from "@/lib/console-data";
import type { Vpc } from "@/types/console";
import { useConsole } from "@/components/sites/console/console-provider";
import { DetailDock } from "@/components/sites/console/detail-dock";
import { ListActions } from "@/components/sites/console/list-actions";
import { PageHeader } from "@/components/sites/console/page-header";
import { Column, ResourceTable } from "@/components/sites/console/resource-table";
import { Shell } from "@/components/sites/console/shell";
import { SampleBadge, type MenuEntry } from "@/components/sites/console/ui";
import { VpcFilter } from "@/components/sites/console/vpc-filter";

type ListAction<T> = {
  label: string;
  disabled?: (selected: T[]) => boolean;
  onSelect: (selected: T[]) => void;
};

type Tab = { id: string; label: string };

/** Set when rows come from the VWS API instead of the local data set. */
type Live = { vpcs: Vpc[]; banner: ReactNode; onRefresh: () => void };

export function NetworkList<T>({
  title,
  info,
  rows,
  getId,
  columns,
  actions,
  createLabel,
  onCreate,
  emptyLine,
  filterPlaceholder,
  showLastUpdated = false,
  hideCount = false,
  selectTitle,
  detailTitle,
  detailTabs,
  renderDetail,
  vpcOf,
  live,
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
  emptyLine: string;
  filterPlaceholder: string;
  showLastUpdated?: boolean;
  hideCount?: boolean;
  /** The dock title while no row is selected. */
  selectTitle: string;
  detailTitle: (row: T) => string;
  detailTabs?: Tab[];
  renderDetail: (row: T, tab: string) => ReactNode;
  vpcOf?: (row: T) => string;
  live?: Live;
  children?: ReactNode;
}) {
  const api = useConsole();
  const initialVpc = useSearchParams().get("vpc") ?? "all";
  const [vpcFilter, setVpcFilter] = useState(initialVpc);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dock, setDock] = useState(240);
  const [tab, setTab] = useState(detailTabs?.[0]?.id ?? "details");
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
        vpcOf ? <VpcFilter vpcs={live ? live.vpcs : api.vpcs} value={vpcFilter} onChange={setVpcFilter} /> : undefined
      }
    >
      <PageHeader
        mark="N"
        crumbs={[{ label: "VPC", href: "/network/vpcs" }, { label: title }]}
        count={hideCount ? undefined : visible.length}
        info={info}
        actions={
          <>
            {!live && api.mode === "sample" ? <SampleBadge /> : null}
            <ListActions
              showLastUpdated={showLastUpdated}
              onRefresh={live ? live.onRefresh : () => undefined}
              items={items}
              createLabel={createLabel}
              onCreate={onCreate}
            />
          </>
        }
      />
      {live?.banner}
      <ResourceTable
        rows={visible}
        getId={getId}
        columns={columns}
        selectedIds={selected.map(getId)}
        onSelectedIds={setSelectedIds}
        emptyTitle=""
        emptyMessage={emptyLine}
        filterPlaceholder={filterPlaceholder}
        variant="aws-list"
      />
      <DetailDock
        title={one ? detailTitle(one) : selectTitle}
        tabs={one ? detailTabs : undefined}
        tab={tab}
        onTab={setTab}
        height={dock}
        onHeight={setDock}
      >
        {one ? renderDetail(one, tab) : null}
      </DetailDock>
      {children}
    </Shell>
  );
}
