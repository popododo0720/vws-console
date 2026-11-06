"use client";

import { useState } from "react";
import Link from "next/link";
import type { Volume } from "@/types/console";
import type { ApiError } from "@/lib/vws-api/adapter";
import { computeNav } from "@/lib/console-data";
import { attachedResource, formatEc2Time } from "@/lib/ebs";
import { DetachVolumeDialog } from "@/components/sites/console/detach-volume-dialog";
import { ResourceDetail } from "@/components/sites/console/resource-detail";
import { CopyText, MenuButton, dash, menuTriggerClass } from "@/components/sites/console/ui";

const capitalize = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : "—");

export function VolumeDetailView({
  id,
  volume,
  loadError,
}: {
  id: string;
  volume: Volume | null;
  loadError: ApiError | null;
}) {
  const [detachOpen, setDetachOpen] = useState(false);
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
      actions={
        volume ? (
          <MenuButton
            className={menuTriggerClass()}
            align="right"
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
                label: "Attach volume",
                disabled: volume.state !== "available",
                href: `/storage/volumes/${volume.id}/attach`,
              },
              {
                label: "Detach volume",
                disabled: volume.state !== "in-use",
                onSelect: () => setDetachOpen(true),
              },
            ]}
          />
        ) : null
      }
      items={
        volume
          ? [
              ["Volume ID", <CopyText key="id" value={volume.id} />],
              ["Size", `${volume.sizeGiB} GiB`],
              ["Type", dash(volume.volumeType)],
              ["Volume state", capitalize(volume.state)],
              ["IOPS", volume.iops === null ? "—" : String(volume.iops)],
              ["Throughput", dash(volume.throughput)],
              ["Availability Zone", dash(volume.availabilityZone)],
              ["Created", dash(formatEc2Time(volume.created))],
              [
                "Attached resources",
                volume.attachment ? (
                  <Link
                    key="att"
                    href={`/compute/instances/${volume.attachment.instanceId}`}
                    className="text-[#006ce0] hover:underline"
                  >
                    {attachedResource(volume.attachment)}
                  </Link>
                ) : (
                  "—"
                ),
              ],
              [
                "Snapshot",
                volume.snapshotId ? (
                  <Link
                    key="snap"
                    href={`/storage/snapshots/${volume.snapshotId}`}
                    className="text-[#006ce0] hover:underline"
                  >
                    {volume.snapshotId}
                  </Link>
                ) : (
                  "—"
                ),
              ],
              ["Owner ID", dash(volume.owner)],
            ]
          : []
      }
    >
      {detachOpen && volume ? <DetachVolumeDialog volume={volume} onClose={() => setDetachOpen(false)} /> : null}
    </ResourceDetail>
  );
}
