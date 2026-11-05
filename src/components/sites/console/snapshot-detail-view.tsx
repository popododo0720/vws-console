"use client";

import Link from "next/link";
import type { Snapshot } from "@/types/console";
import type { ApiError } from "@/lib/vws-api/adapter";
import { computeNav } from "@/lib/console-data";
import { snapshotProgress } from "@/lib/ebs";
import { ResourceDetail } from "@/components/sites/console/resource-detail";
import { CopyText, dash } from "@/components/sites/console/ui";

export function snapshotFields(snapshot: Snapshot): [string, React.ReactNode][] {
  return [
    ["Snapshot ID", <CopyText key="id" value={snapshot.id} />],
    ["Owner ID", dash(snapshot.owner)],
    [
      "Volume ID",
      <Link key="vol" href={`/storage/volumes/${snapshot.volumeId}`} className="text-[#006ce0] hover:underline">
        {snapshot.volumeId}
      </Link>,
    ],
    ["Volume size", `${snapshot.sizeGiB} GiB`],
    ["Full snapshot size", "—"],
    ["Storage tier", "Standard"],
    ["Snapshot status", snapshot.state ? snapshot.state.charAt(0).toUpperCase() + snapshot.state.slice(1) : "—"],
    ["Progress", snapshotProgress(snapshot.state)],
    ["Started", dash(snapshot.started)],
    ["Description", dash(snapshot.description)],
  ];
}

export function SnapshotDetailView({
  id,
  snapshot,
  loadError,
}: {
  id: string;
  snapshot: Snapshot | null;
  loadError: ApiError | null;
}) {
  return (
    <ResourceDetail
      tree={computeNav}
      crumbs={[
        { label: "EC2", href: "/compute/instances" },
        { label: "Snapshots", href: "/storage/snapshots" },
      ]}
      kind="snapshot"
      id={id}
      backHref="/storage/snapshots"
      found={Boolean(snapshot)}
      loadError={loadError}
      items={snapshot ? snapshotFields(snapshot) : []}
    />
  );
}
