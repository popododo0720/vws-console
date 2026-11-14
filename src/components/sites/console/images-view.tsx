"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiErrorAlert } from "@/components/sites/console/api-action";
import { RefreshIconButton } from "@/components/sites/console/ebs-form-parts";
import { SuccessBadge } from "@/components/sites/console/network-cells";
import { PageHeader } from "@/components/sites/console/page-header";
import { Column, ResourceTable } from "@/components/sites/console/resource-table";
import { Shell } from "@/components/sites/console/shell";
import { dash } from "@/components/sites/console/ui";
import { computeNav } from "@/lib/console-data";
import { formatEc2Time } from "@/lib/ebs";
import type { ApiError, Image } from "@/lib/vws-api/adapter";

const statusLabel = (state: string) => state.charAt(0).toUpperCase() + state.slice(1);

const columns: Column<Image>[] = [
  { key: "name", header: "AMI name", minWidth: 220, sortValue: (row) => row.name, cell: (row) => dash(row.name) },
  { key: "id", header: "AMI ID", minWidth: 200, sortValue: (row) => row.id, cell: (row) => dash(row.id) },
  { key: "owner", header: "Owner", minWidth: 140, sortValue: (row) => row.owner, cell: (row) => dash(row.owner) },
  {
    key: "state",
    header: "Status",
    minWidth: 130,
    sortValue: (row) => statusLabel(row.state),
    cell: (row) => (row.state === "available" ? <SuccessBadge>Available</SuccessBadge> : dash(statusLabel(row.state))),
  },
  {
    key: "architecture",
    header: "Architecture",
    minWidth: 130,
    sortValue: (row) => row.architecture,
    cell: (row) => dash(row.architecture),
  },
  {
    key: "created",
    header: "Creation date",
    minWidth: 200,
    sortValue: (row) => row.creationDate,
    cell: (row) => dash(formatEc2Time(row.creationDate)),
  },
];

export function ImagesView({ images, loadError }: { images: Image[]; loadError: ApiError | null }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  return (
    <Shell tree={computeNav}>
      <PageHeader
        crumbs={[{ label: "EC2", href: "/compute/instances" }, { label: "AMIs" }]}
        title="Amazon Machine Images (AMIs)"
        info="An AMI is an image with the software an instance starts from. The list shows the images in the selected Region."
        actions={<RefreshIconButton label="Refresh" onClick={() => router.refresh()} />}
      />
      <ApiErrorAlert error={loadError} title="AMIs could not be loaded" />
      <ResourceTable
        rows={images}
        region={(row) => row.region}
        getId={(row) => row.id}
        columns={columns}
        selectedIds={selectedIds}
        onSelectedIds={setSelectedIds}
        emptyTitle=""
        emptyMessage={loadError ? "" : "No AMIs in this Region"}
        filterPlaceholder="Filter AMI by attribute or tag"
        variant="aws-list"
        selection="single"
      />
    </Shell>
  );
}
