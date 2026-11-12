"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Snapshot } from "@/types/console";
import type { ApiError } from "@/lib/vws-api/adapter";
import { computeNav } from "@/lib/console-data";
import { parseCreateVolume, VOLUME_TYPES, volumeTypeSpec, type VolumeTypeName } from "@/lib/ebs";
import { createVolumeAction } from "@/app/actions/resources";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { useConsole } from "@/components/sites/console/console-provider";
import {
  CreatePage,
  Field,
  FormCard,
  RefreshIconButton,
  TagsCard,
  optional,
  primaryPill,
  useIdempotencyKey,
} from "@/components/sites/console/ebs-form-parts";
import { Shell } from "@/components/sites/console/shell";
import { OrangeButton } from "@/components/sites/console/ui";

const NO_SNAPSHOT = "";

/** gp2 IOPS are not set: 3 per GiB, at least 100, bursting to 3,000. */
const gp2Iops = (size: number) => `${Math.min(16000, Math.max(100, 3 * size))} / 3000`;

/** Only plain digits are a number; `0x10`, `1e2` and `12.0` stay invalid instead of passing through Number(). */
const toNumber = (value: string) => (value === "" ? null : /^\d+$/.test(value) ? Number(value) : NaN);

export function CreateVolumeView({
  snapshots,
  snapshotsError,
  zones,
  initialSnapshotId,
}: {
  snapshots: Snapshot[];
  snapshotsError: ApiError | null;
  zones: string[];
  initialSnapshotId: string;
}) {
  const router = useRouter();
  const action = useApiAction();
  const idempotency = useIdempotencyKey("vws:create-volume");
  const initialSnapshot = snapshots.find((item) => item.id === initialSnapshotId) ?? null;
  const [volumeType, setVolumeType] = useState<VolumeTypeName>("gp3");
  const [size, setSize] = useState(initialSnapshot ? String(initialSnapshot.sizeGiB) : "100");
  const [iops, setIops] = useState("3000");
  const [throughput, setThroughput] = useState("125");
  const [zone, setZone] = useState(zones[0] ?? "");
  const [snapshotId, setSnapshotId] = useState(initialSnapshot?.id ?? NO_SNAPSHOT);
  const [problem, setProblem] = useState<string | null>(null);
  const noSnapshot = useConsole().limited("ec2:CreateVolume", "NoSnapshotSource");
  const spec = volumeTypeSpec(volumeType) ?? VOLUME_TYPES[0];
  const sizeNumber = Number(size);

  const request = {
    volumeType,
    size: toNumber(size),
    iops: spec.iops ? toNumber(iops) : null,
    throughput: spec.throughput ? toNumber(throughput) : null,
    availabilityZone: zone,
    snapshotId: snapshotId === NO_SNAPSHOT || noSnapshot !== null ? null : snapshotId,
  };

  const submit = () => {
    const parsed = parseCreateVolume(request);
    if ("code" in parsed) {
      setProblem(parsed.message);
      return;
    }
    setProblem(null);
    const key = idempotency.keyFor(parsed);
    action.run(
      () => createVolumeAction(parsed, key),
      () => {
        idempotency.settle();
        router.push("/storage/volumes");
      },
    );
  };

  return (
    <Shell tree={computeNav} navMode="overlay-only">
      <CreatePage
        crumbs={[
          { label: "EC2", href: "/compute/instances" },
          { label: "Volumes", href: "/storage/volumes" },
          { label: "Create volume" },
        ]}
        title="Create volume"
        info="The volume is created through the VWS API in the Availability Zone you choose."
        lead="Create a VWS EBS volume to attach to any EC2 instance in the same Availability Zone."
      >
        <FormCard title="Volume settings">
          <Field label="Volume type" htmlFor="volume-type" info="The type sets the volume's performance and price.">
            <select
              id="volume-type"
              className="field max-w-[783px]"
              value={volumeType}
              onChange={(event) => {
                const next = volumeTypeSpec(event.target.value);
                if (!next) return;
                setVolumeType(next.type);
                if (next.iops) setIops(String(next.iops.default));
                if (next.throughput) setThroughput(String(next.throughput.default));
              }}
            >
              {VOLUME_TYPES.map((item) => (
                <option key={item.type} value={item.type}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Size (GiB)"
            htmlFor="volume-size"
            info="A volume restored from a snapshot is at least as large as the snapshot."
            hint={`Min: ${spec.size.min} GiB, Max: ${spec.size.max} GiB.`}
          >
            <input
              id="volume-size"
              className="field max-w-[100px]"
              inputMode="numeric"
              value={size}
              onChange={(event) => setSize(event.target.value)}
            />
          </Field>
          <Field
            label="IOPS"
            htmlFor="volume-iops"
            info="The number of I/O operations per second the volume can serve."
            hint={
              spec.iops
                ? `Min: ${spec.iops.min} IOPS, Max: ${spec.iops.max} IOPS.`
                : volumeType === "gp2"
                  ? "Baseline of 3 IOPS per GiB with a minimum of 100 IOPS, burstable to 3000 IOPS."
                  : undefined
            }
          >
            <input
              id="volume-iops"
              className="field max-w-[261px] disabled:bg-[#f4f4f4] disabled:text-[#5f6b7a]"
              inputMode="numeric"
              disabled={!spec.iops}
              value={
                spec.iops
                  ? iops
                  : volumeType === "gp2" && Number.isFinite(sizeNumber)
                    ? gp2Iops(sizeNumber)
                    : "Not applicable"
              }
              onChange={(event) => setIops(event.target.value)}
            />
          </Field>
          <Field
            label="Throughput (MiB/s)"
            htmlFor="volume-throughput"
            info="The data the volume can transfer per second."
            hint={
              spec.throughput
                ? `Min: ${spec.throughput.min} MiB, Max: ${spec.throughput.max} MiB. Baseline: ${spec.throughput.default} MiB/s.`
                : undefined
            }
          >
            <input
              id="volume-throughput"
              className="field max-w-[261px] disabled:bg-[#f4f4f4] disabled:text-[#5f6b7a]"
              inputMode="numeric"
              disabled={!spec.throughput}
              value={spec.throughput ? throughput : "Not applicable"}
              onChange={(event) => setThroughput(event.target.value)}
            />
          </Field>
          <Field
            label="Availability Zone"
            htmlFor="volume-zone"
            info="A volume can be attached only to instances in the same Availability Zone."
          >
            <select
              id="volume-zone"
              className="field max-w-[783px]"
              value={zone}
              onChange={(event) => setZone(event.target.value)}
            >
              {zones.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={optional("Snapshot ID")}
            htmlFor="volume-snapshot"
            info="Restore the volume from a snapshot. Leave it empty for a blank volume."
            hint={noSnapshot ?? undefined}
          >
            <div className="flex max-w-[783px] items-center gap-5">
              <select
                id="volume-snapshot"
                className="field max-w-[703px] disabled:bg-[#f4f4f4] disabled:text-[#5f6b7a]"
                disabled={noSnapshot !== null}
                value={noSnapshot === null ? snapshotId : NO_SNAPSHOT}
                onChange={(event) => {
                  setSnapshotId(event.target.value);
                  const chosen = snapshots.find((item) => item.id === event.target.value);
                  if (chosen && Number(size) < chosen.sizeGiB) setSize(String(chosen.sizeGiB));
                }}
              >
                <option value={NO_SNAPSHOT}>Don&apos;t create volume from a snapshot</option>
                {snapshots
                  .filter((item) => item.state === "completed")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.description ? `${item.id} (${item.description})` : item.id}
                    </option>
                  ))}
              </select>
              <RefreshIconButton label="Refresh snapshots" onClick={action.refresh} />
            </div>
            <ApiErrorAlert error={snapshotsError} title="Snapshots could not be loaded" />
          </Field>
          <Field
            label="Encryption"
            info="VWS volumes are not encrypted by the console yet."
            description="Use VWS EBS encryption as an encryption solution for your EBS resources associated with your EC2 instances."
          >
            <label
              className="inline-flex items-center gap-2 text-[#5f6b7a]"
              title="console-api does not encrypt volumes yet."
            >
              <input type="checkbox" disabled />
              Encrypt this volume
            </label>
          </Field>
        </FormCard>
        <TagsCard title={optional("Tags")} />
        {problem ? (
          <p role="alert" className="text-[13px] text-[#d91515]">
            {problem}
          </p>
        ) : null}
        <ApiErrorAlert error={action.error} title="The volume could not be created" />
        <div className="flex items-center justify-end gap-6">
          <Link href="/storage/volumes" className="text-[14px] font-bold text-[#006ce0] hover:underline">
            Cancel
          </Link>
          <OrangeButton
            action="ec2:CreateVolume"
            className={primaryPill}
            disabled={action.pending || zones.length === 0}
            onClick={submit}
          >
            Create volume
          </OrangeButton>
        </div>
      </CreatePage>
    </Shell>
  );
}
