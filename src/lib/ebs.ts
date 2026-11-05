import type { ApiError } from "@/lib/vws-api/adapter";

type Range = { min: number; max: number };

export type VolumeTypeSpec = {
  type: VolumeTypeName;
  label: string;
  size: Range;
  /** Provisioned IOPS; null when the type takes no IOPS. */
  iops: (Range & { default: number; perGiB: number; included: number }) | null;
  /** Provisioned throughput in MiB/s; null when the type takes none. */
  throughput: (Range & { default: number; perIops: number }) | null;
};

/** The volume types VWS offers, with console-api's limits (vws-console-api internal/resource/volumeshape.go). */
export const VOLUME_TYPES = [
  {
    type: "gp3",
    label: "General Purpose SSD (gp3)",
    size: { min: 1, max: 65536 },
    iops: { min: 3000, max: 80000, default: 3000, perGiB: 500, included: 3000 },
    throughput: { min: 125, max: 2000, default: 125, perIops: 0.25 },
  },
  { type: "gp2", label: "General Purpose SSD (gp2)", size: { min: 1, max: 16384 }, iops: null, throughput: null },
  { type: "standard", label: "Magnetic (standard)", size: { min: 1, max: 1024 }, iops: null, throughput: null },
] as const satisfies readonly (Omit<VolumeTypeSpec, "type"> & { type: string })[];

export type VolumeTypeName = (typeof VOLUME_TYPES)[number]["type"];

export function volumeTypeSpec(type: string): VolumeTypeSpec | null {
  return VOLUME_TYPES.find((spec) => spec.type === type) ?? null;
}

const VOLUME_ID = /^vol-[0-9a-f]{8,17}$/;
const SNAPSHOT_ID = /^snap-[0-9a-f]{8,17}$/;
const ZONE = /^[a-z0-9-]{1,64}$/;
export const SNAPSHOT_DESCRIPTION_MAX = 255;

export const isVolumeId = (value: unknown): value is string => typeof value === "string" && VOLUME_ID.test(value);
export const isSnapshotId = (value: unknown): value is string => typeof value === "string" && SNAPSHOT_ID.test(value);

export type CreateVolumeInput = {
  volumeType: VolumeTypeName;
  /** Null only when the volume is restored from a snapshot and takes the snapshot's size. */
  size: number | null;
  iops: number | null;
  throughput: number | null;
  availabilityZone: string;
  snapshotId: string | null;
};

export type CreateSnapshotInput = { volumeId: string; description: string };

const invalid = (message: string): ApiError => ({ code: "InvalidParameterValue", message, requestId: null });

const isInt = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);

function inRange(name: string, value: unknown, range: Range, unit: string): number | ApiError {
  if (!isInt(value)) return invalid(`${name} must be a whole number.`);
  if (value < range.min || value > range.max)
    return invalid(`${name} must be from ${range.min} to ${range.max} ${unit}.`);
  return value;
}

/** Checks a Create volume request against the same rules console-api applies. Runs in the form and the server action. */
export function parseCreateVolume(raw: unknown): CreateVolumeInput | ApiError {
  if (typeof raw !== "object" || raw === null) return invalid("The request is not valid.");
  const body = raw as Record<string, unknown>;
  const spec = typeof body.volumeType === "string" ? volumeTypeSpec(body.volumeType) : null;
  if (!spec) return invalid("Choose a volume type.");
  const snapshotId = body.snapshotId === null || body.snapshotId === undefined ? null : body.snapshotId;
  if (snapshotId !== null && !isSnapshotId(snapshotId)) return invalid("The snapshot ID is not valid.");
  if (typeof body.availabilityZone !== "string" || !ZONE.test(body.availabilityZone))
    return invalid("Choose an Availability Zone.");

  let size: number | null = null;
  if (body.size !== null && body.size !== undefined) {
    const parsed = inRange("Size", body.size, spec.size, "GiB");
    if (typeof parsed !== "number") return parsed;
    size = parsed;
  } else if (snapshotId === null) {
    return invalid(`Size must be from ${spec.size.min} to ${spec.size.max} GiB.`);
  }

  let iops: number | null = null;
  let throughput: number | null = null;
  if (spec.iops) {
    const parsed = inRange("IOPS", body.iops ?? spec.iops.default, spec.iops, "IOPS");
    if (typeof parsed !== "number") return parsed;
    iops = parsed;
    if (size !== null && iops > spec.iops.included && iops > spec.iops.perGiB * size)
      return invalid(`IOPS can be at most ${spec.iops.perGiB} per GiB of size.`);
  } else if (body.iops !== null && body.iops !== undefined) {
    return invalid(`${spec.type} volumes do not take IOPS.`);
  }
  if (spec.throughput) {
    const parsed = inRange("Throughput", body.throughput ?? spec.throughput.default, spec.throughput, "MiB/s");
    if (typeof parsed !== "number") return parsed;
    throughput = parsed;
    if (iops !== null && throughput > iops * spec.throughput.perIops)
      return invalid(`Throughput can be at most ${spec.throughput.perIops} MiB/s per IOPS.`);
  } else if (body.throughput !== null && body.throughput !== undefined) {
    return invalid(`${spec.type} volumes do not take throughput.`);
  }

  return { volumeType: spec.type, size, iops, throughput, availabilityZone: body.availabilityZone, snapshotId };
}

export function parseCreateSnapshot(raw: unknown): CreateSnapshotInput | ApiError {
  if (typeof raw !== "object" || raw === null) return invalid("The request is not valid.");
  const body = raw as Record<string, unknown>;
  if (!isVolumeId(body.volumeId)) return invalid("Choose a volume.");
  const description = body.description ?? "";
  if (typeof description !== "string") return invalid("The description is not valid.");
  if (description.length > SNAPSHOT_DESCRIPTION_MAX)
    return invalid(`The description can have at most ${SNAPSHOT_DESCRIPTION_MAX} characters.`);
  return { volumeId: body.volumeId, description };
}

const capitalize = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : "");

/** The Progress column: EC2 shows the state with a percentage, which console-api reports only as done or not. */
export function snapshotProgress(state: string): string {
  if (state === "completed") return "Available (100%)";
  return capitalize(state) || "—";
}

const pad = (value: number) => String(value).padStart(2, "0");

/** EC2 tables show times as `2026/11/05 08:26 GMT+0`. The console renders UTC so server and browser agree. */
export function formatEc2Time(iso: string): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return iso;
  return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} GMT+0`;
}

export function attachedResource(attachment: { instanceId: string; device: string } | null): string {
  if (!attachment) return "";
  return attachment.device ? `${attachment.instanceId}: ${attachment.device}` : attachment.instanceId;
}

const summaryTime = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "UTC",
});

/** The Snapshot summary stamp, `Thu, Nov 5, 2026, 8:26:38 AM (GMT+00:00)`, in UTC like the tables. */
export function formatSummaryTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : `${summaryTime.format(date)} (GMT+00:00)`;
}
