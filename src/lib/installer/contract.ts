// Installer API contract, popododo0720/vws-deploy#139 (base /api/v1).
// Storage additions (nfs, existing + volumeMode) follow vws-deploy#162 and vws-storage#72.

export const STEP_IDS = ["roles", "network", "storage", "eip", "profile", "observability"] as const;
export type StepId = (typeof STEP_IDS)[number];

export type StepStatus = "pending" | "valid" | "invalid";
export type SessionState = "editing" | "confirming" | "installing" | "succeeded" | "failed" | "finished";

export type FieldError = { field: string; code: string; message: string };

export type PreflightCheck = {
  id: string;
  severity: "error" | "warning" | "info";
  status: "pass" | "fail" | "unknown";
  node?: string;
  field?: string;
  message: string;
  hint?: string;
};

export type PreflightReport = { ranAt: string; checks: PreflightCheck[] };

export type StorageDriver = "rook-ceph" | "minio" | "local" | "existing" | "nfs";
export type VolumeMode = "Block" | "Filesystem";

export type StorageSpec =
  | { driver: "rook-ceph" }
  | { driver: "existing"; storageClass: string; snapshotClass?: string; volumeMode?: VolumeMode }
  | { driver: "nfs"; nfs: { server: string; share: string } };

export type StepResult<V = unknown, O = unknown> = {
  step: StepId;
  status: StepStatus;
  defaults: V;
  value: V;
  options: O;
  preflight: PreflightReport | null;
  errors: FieldError[];
};

export type ApiError = {
  error: { code: string; message: string; fields?: FieldError[]; retryable: boolean };
};

export type ProgressEvent = { phase: string; index: number; total: number; percent: number; state: "running" | "done" | "failed" };
export type LogEvent = { ts: string; phase: string; level: string; line: string };
export type DoneEvent = { result: "succeeded" | "failed"; error?: ApiError["error"] };

export type InstallerResult = { consoleUrl: string; adminUser: string; credentialAvailable: boolean };

// Drivers listed in the wizard. Disabled ones stay visible until their driver ships
// (minio: vws-storage#70, local: vws-storage#71).
export const STORAGE_CHOICES: { driver: StorageDriver; label: string; enabled: boolean }[] = [
  { driver: "rook-ceph", label: "Rook Ceph", enabled: true },
  { driver: "nfs", label: "NFS", enabled: true },
  { driver: "existing", label: "Generic CSI (existing StorageClass)", enabled: true },
  { driver: "minio", label: "MinIO", enabled: false },
  { driver: "local", label: "Local", enabled: false },
];

const HOST = /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const IPV4 = /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

function isHost(value: string) {
  return IPV4.test(value) || (HOST.test(value) && !/^[\d.]+$/.test(value)) || /^[0-9a-fA-F:]+$/.test(value) && value.includes(":");
}

// Client-side mirror of the server rules, so the form can flag errors before PUT.
// The server stays authoritative; its FieldErrors replace these after a save.
export function validateStorage(spec: StorageSpec, storageClasses: string[]): FieldError[] {
  const errors: FieldError[] = [];
  if (spec.driver === "nfs") {
    const { server, share } = spec.nfs;
    if (!server.trim()) errors.push({ field: "spec.storage.nfs.server", code: "required", message: "Enter the NFS server host name or IP address." });
    else if (!isHost(server.trim())) errors.push({ field: "spec.storage.nfs.server", code: "invalid", message: "Enter a valid host name or IP address." });
    if (!share.trim()) errors.push({ field: "spec.storage.nfs.share", code: "required", message: "Enter the export path." });
    else if (!share.trim().startsWith("/")) errors.push({ field: "spec.storage.nfs.share", code: "invalid", message: "The export path must be absolute, for example /exports/vws." });
  }
  if (spec.driver === "existing") {
    if (!spec.storageClass) errors.push({ field: "spec.storage.storageClass", code: "required", message: "Choose a StorageClass." });
    else if (!storageClasses.includes(spec.storageClass)) errors.push({ field: "spec.storage.storageClass", code: "not_found", message: "That StorageClass is not in the cluster." });
  }
  return errors;
}

export function blocksNextStep(report: PreflightReport | null) {
  return report?.checks.some((c) => c.status === "fail" && c.severity === "error") ?? false;
}

// Steps are fixed-order; a step is editable only after every earlier step is valid
// (server answers 409 step_out_of_order otherwise).
export function reachableSteps(status: Record<StepId, StepStatus>): StepId[] {
  const out: StepId[] = [];
  for (const step of STEP_IDS) {
    out.push(step);
    if (status[step] !== "valid") break;
  }
  return out;
}

export function summaryReady(status: Record<StepId, StepStatus>) {
  return STEP_IDS.every((s) => status[s] === "valid");
}
