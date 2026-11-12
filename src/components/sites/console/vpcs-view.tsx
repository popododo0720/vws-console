"use client";

import { DetailLink } from "@/components/sites/console/resource-detail";
import { useState } from "react";
import { TagsTable } from "@/components/sites/console/tags-table";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Subnet, Vpc } from "@/types/console";
import { networkNav } from "@/lib/console-data";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { createVpcAction, deleteVpcsAction, renameVpcAction } from "@/app/actions/resources";
import type { ApiError } from "@/lib/vws-api/adapter";
import { DetailDock } from "@/components/sites/console/detail-dock";
import { ListActions } from "@/components/sites/console/list-actions";
import { BlockPublicAccessCell, SuccessBadge } from "@/components/sites/console/network-cells";
import { PageHeader } from "@/components/sites/console/page-header";
import { Column, NameCell, ResourceTable } from "@/components/sites/console/resource-table";
import { Shell } from "@/components/sites/console/shell";
import { FieldLabel, OrangeButton, OutlineButton, PanelDialog, dash } from "@/components/sites/console/ui";
import { VpcFilter, useVpcFilter } from "@/components/sites/console/vpc-filter";

export function VpcsView({ vpcs, subnets, loadError }: { vpcs: Vpc[]; subnets: Subnet[]; loadError: ApiError | null }) {
  const action = useApiAction();
  const params = useSearchParams();
  const [vpcFilter, setVpcFilter] = useVpcFilter(vpcs, params.get("vpc") ?? "all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dock, setDock] = useState(200);
  const [createOpen, setCreateOpen] = useState(params.get("create") === "1");
  const router = useRouter();
  const pathname = usePathname();
  const closeCreate = () => {
    setCreateOpen(false);
    if (!params.has("create")) return;
    const rest = new URLSearchParams(params);
    rest.delete("create");
    router.replace(rest.size ? `${pathname}?${rest}` : pathname);
  };
  const [vpcTab, setVpcTab] = useState("details");
  const [cidr, setCidr] = useState("10.1.0.0/16");
  const [newName, setNewName] = useState("");
  const rows = vpcFilter === "all" ? vpcs : vpcs.filter((item) => item.id === vpcFilter);
  const selected = rows.filter((item) => selectedIds.includes(item.id));
  const one = selected.length === 1 ? selected[0] : null;

  const columns: Column<Vpc>[] = [
    {
      key: "name",
      header: "Name",
      minWidth: 120,
      sortValue: (row) => row.name,
      cell: (row) => (
        <NameCell
          value={row.name}
          onRename={(name) => {
            if (name !== row.name) action.run(() => renameVpcAction(row.id, name));
          }}
        />
      ),
    },
    {
      key: "id",
      header: "VPC ID",
      minWidth: 190,
      sortValue: (row) => row.id,
      cell: (row) => <DetailLink href={`/network/vpcs/${row.id}`} id={row.id} />,
    },
    {
      key: "state",
      header: "State",
      minWidth: 130,
      sortValue: (row) => row.state,
      cell: (row) =>
        row.state === "available" ? (
          <SuccessBadge>Available</SuccessBadge>
        ) : (
          <span className="text-[#006ce0]">Pending</span>
        ),
    },
    {
      key: "encryption",
      header: "Encryption",
      minWidth: 120,
      sortValue: (row) => row.encryption,
      cell: (row) => dash(row.encryption),
    },
    {
      key: "control",
      header: "Encryption control",
      minWidth: 150,
      sortValue: (row) => row.encryptionControl,
      cell: (row) => dash(row.encryptionControl),
    },
    {
      key: "block",
      header: "Block Public Access",
      minWidth: 150,
      sortValue: (row) => row.blockPublicAccess,
      cell: (row) => <BlockPublicAccessCell value={row.blockPublicAccess} />,
    },
    { key: "cidr", header: "IPv4 CIDR", minWidth: 130, sortValue: (row) => row.ipv4Cidr, cell: (row) => row.ipv4Cidr },
    {
      key: "ipv6",
      header: "IPv6 CIDR",
      minWidth: 120,
      sortValue: (row) => row.ipv6Cidr,
      cell: (row) => dash(row.ipv6Cidr),
    },
  ];

  return (
    <Shell tree={networkNav} navHeader={<VpcFilter vpcs={vpcs} value={vpcFilter} onChange={setVpcFilter} />}>
      <PageHeader
        mark="N"
        crumbs={[{ label: "VPC", href: "/network/vpcs" }, { label: "Your VPCs" }]}
        count={loadError ? undefined : rows.length}
        lead={
          <div className="border-b border-[#e6e8eb] px-4 pt-3">
            <p className="text-[20px] font-bold leading-7">Your VPCs</p>
            <div className="mt-2 flex gap-4 text-[14px]">
              <span className="border-b-2 border-[#006ce0] pb-2 font-semibold text-[#006ce0]">VPCs</span>
              <span className="pb-2 text-[#5f6b7a]">VPC encryption controls</span>
            </div>
          </div>
        }
        info="A VPC is an isolated network in the current region, read from the VWS API."
        actions={
          <ListActions
            showLastUpdated={!loadError}
            onRefresh={action.refresh}
            items={[
              {
                label: "Delete",
                action: "ec2:DeleteVpc",
                disabled: action.pending || selected.length === 0,
                onSelect: () =>
                  action.run(
                    () => deleteVpcsAction(selected.map((item) => item.id)),
                    () => setSelectedIds([]),
                  ),
              },
            ]}
            createLabel="Create VPC"
            createAction="ec2:CreateVpc"
            onCreate={() => setCreateOpen(true)}
          />
        }
      />
      <ApiErrorAlert error={loadError} title="VPCs could not be loaded" />
      <ApiErrorAlert error={action.error} title="The VPC action failed" />
      <ResourceTable
        rows={rows}
        region={(row) => row.region}
        getId={(row) => row.id}
        columns={columns}
        selectedIds={selected.map((item) => item.id)}
        onSelectedIds={setSelectedIds}
        emptyTitle=""
        emptyMessage={loadError ? "" : "No VPCs found"}
        filterPlaceholder="Filter VPCs by attribute or tag"
        variant="aws-list"
      />
      <DetailDock
        title={one ? one.name || one.id : "Select a VPC above"}
        tabs={
          one
            ? [
                { id: "details", label: "Details" },
                { id: "cidrs", label: "CIDRs" },
                { id: "map", label: "Resource map" },
                { id: "tags", label: "Tags" },
              ]
            : undefined
        }
        tab={vpcTab}
        onTab={setVpcTab}
        height={dock}
        onHeight={setDock}
      >
        {one ? (
          vpcTab === "tags" ? (
            <TagsTable tags={one.tags} />
          ) : vpcTab === "map" ? (
            <dl className="grid gap-3 text-[13px] sm:grid-cols-3">
              <div>
                <dt className="font-semibold text-[#5f6b7a]">Subnets</dt>
                <dd>
                  {subnets
                    .filter((item) => item.vpcId === one.id)
                    .map((item) => item.id)
                    .join(", ") || "—"}
                </dd>
              </div>
            </dl>
          ) : vpcTab === "cidrs" ? (
            <p className="text-[13px]">
              IPv4 {one.ipv4Cidr} · IPv6 {dash(one.ipv6Cidr)}
            </p>
          ) : (
            <dl className="grid gap-3 text-[13px] sm:grid-cols-3">
              <div>
                <dt className="text-[#5f6b7a]">VPC ID</dt>
                <dd>{one.id}</dd>
              </div>
              <div>
                <dt className="text-[#5f6b7a]">IPv4 CIDR</dt>
                <dd>{one.ipv4Cidr}</dd>
              </div>
              <div>
                <dt className="text-[#5f6b7a]">Owner ID</dt>
                <dd>{dash(one.owner)}</dd>
              </div>
              <div>
                <dt className="text-[#5f6b7a]">Default VPC</dt>
                <dd>{one.isDefault === null ? "—" : one.isDefault ? "Yes" : "No"}</dd>
              </div>
            </dl>
          )
        ) : null}
      </DetailDock>
      <PanelDialog
        open={createOpen}
        title="Create VPC"
        onClose={closeCreate}
        footer={
          <>
            <OutlineButton onClick={closeCreate}>Cancel</OutlineButton>
            <OrangeButton
              action="ec2:CreateVpc"
              disabled={action.pending}
              onClick={() => action.run(() => createVpcAction(cidr, newName), closeCreate)}
            >
              Create VPC
            </OrangeButton>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <FieldLabel>Name tag (optional)</FieldLabel>
            <input
              className="field"
              aria-label="VPC name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
          </div>
          <div>
            <FieldLabel>IPv4 CIDR</FieldLabel>
            <input
              className="field"
              aria-label="IPv4 CIDR"
              value={cidr}
              onChange={(event) => setCidr(event.target.value)}
            />
          </div>
          <ApiErrorAlert error={action.error} title="The VPC could not be created" />
        </div>
      </PanelDialog>
    </Shell>
  );
}
