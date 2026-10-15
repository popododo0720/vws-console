"use client";

import Link from "next/link";
import type { Volume } from "@/types/console";
import type { ApiError } from "@/lib/vws-api/adapter";
import { computeNav } from "@/lib/console-data";
import { ResourceDetail } from "@/components/sites/console/resource-detail";
import { CopyText, dash } from "@/components/sites/console/ui";

export function VolumeDetailView({
  id,
  volume,
  loadError,
}: {
  id: string;
  volume: Volume | null;
  loadError: ApiError | null;
}) {
  return (
    <ResourceDetail
      tree={computeNav}
      crumbs={[
        { label: "EC2", href: "/compute/instances" },
        { label: "Volumes", href: "/storage/volumes" },
      ]}
      kind="volume"
      id={id}
      backHref="/storage/volumes"
      found={Boolean(volume)}
      loadError={loadError}
      items={
        volume
          ? [
              ["Volume ID", <CopyText key="id" value={volume.id} />],
              ["Size", `${volume.sizeGiB} GiB`],
              ["Type", dash(volume.volumeType)],
              ["Volume state", volume.state ? volume.state.charAt(0).toUpperCase() + volume.state.slice(1) : "—"],
              ["Availability Zone", dash(volume.availabilityZone)],
              ["Created", dash(volume.created)],
              [
                "Attached instance",
                volume.attachedTo ? (
                  <Link
                    key="att"
                    href={`/compute/instances/${volume.attachedTo}`}
                    className="text-[#006ce0] hover:underline"
                  >
                    {volume.attachedTo}
                  </Link>
                ) : (
                  "—"
                ),
              ],
              ["Snapshot ID", dash(volume.snapshotId)],
              ["IOPS", volume.iops === null ? "—" : String(volume.iops)],
              ["Throughput", dash(volume.throughput)],
              ["Owner ID", dash(volume.owner)],
            ]
          : []
      }
    />
  );
}
