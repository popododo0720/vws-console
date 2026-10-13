import {
  STEP_IDS,
  reachableSteps,
  summaryReady,
  validateStorage,
  type ApiError,
  type FieldError,
  type InstallerResult,
  type PreflightReport,
  type ProgressEvent,
  type SessionState,
  type StepId,
  type StepStatus,
  type StorageSpec,
} from "@/lib/installer/contract";

// MOCK_: sample values for the contract mockup while the installer API (vws-deploy#141)
// is built. Names reuse the examples in vws-deploy#139. Nothing here comes from a real cluster.
export const MOCK_NODES = [
  { name: "node1", roles: ["control-plane", "compute"] },
  { name: "node2", roles: ["compute"] },
];
// MOCK_: NIC options, matching the StepResult example in vws-deploy#139.
export const MOCK_NICS = [{ name: "enp1s0", mtu: 1500, nodes: ["node1", "node2"] }];
// MOCK_: StorageClasses the API would list for the generic CSI choice.
export const MOCK_STORAGE_CLASSES = ["example-csi-block"];
// MOCK_: install phases replayed in place of the SSE stream.
export const MOCK_PHASES = ["platform/01-crds", "platform/02-cni", "platform/03-rook", "services/01-core"];
// MOCK_: obviously fake one-time credential (vws-deploy#139: test values must be plainly fake).
export const MOCK_CREDENTIAL = "EXAMPLE-NOT-A-REAL-PASSWORD";

// profile values come from vws-deploy#43 (single-node / small / ha).
export const PROFILES = ["single-node", "small", "ha"] as const;

export type NetworkValue = { nodes: { tunnel: { nic: string }; external: { nic: string } } };
export type StepValues = {
  roles: Record<string, never>;
  network: NetworkValue;
  storage: StorageSpec;
  eip: { eipPool: string };
  profile: { profile: (typeof PROFILES)[number] };
  observability: { otlpEndpoint: string };
};

export type PutResult = { status: StepStatus; errors: FieldError[]; preflight: PreflightReport };

const CIDR = /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\/(3[0-2]|[12]?\d)$/;

function check(id: string, ok: boolean, message: string, field?: string): PreflightReport["checks"][number] {
  return { id, severity: "error", status: ok ? "pass" : "fail", message, field };
}

function validate<S extends StepId>(step: S, value: StepValues[S]): { errors: FieldError[]; preflight: PreflightReport } {
  const ranAt = new Date().toISOString();
  const v = value as StepValues[StepId];
  let errors: FieldError[] = [];
  let checks: PreflightReport["checks"] = [];
  if (step === "network") {
    const n = (v as NetworkValue).nodes;
    errors = (["tunnel", "external"] as const)
      .filter((k) => !n[k].nic)
      .map((k) => ({ field: `spec.network.nodes.${k}.nic`, code: "required", message: "Choose a NIC." }));
    checks = [check("nic.exists", errors.length === 0, "NIC is present on every node.", "spec.network.nodes.tunnel.nic")];
  }
  if (step === "storage") {
    const s = v as StorageSpec;
    errors = validateStorage(s, MOCK_STORAGE_CLASSES);
    if (s.driver === "nfs") checks = [{ id: "storage.nfs.reachable", severity: "error", status: "unknown", message: "Mockup cannot reach the NFS server; the installer checks this." }];
    if (s.driver === "existing") checks = [check("storage.class.exists", errors.length === 0, "StorageClass exists.", "spec.storage.storageClass")];
  }
  if (step === "eip") {
    const pool = (v as StepValues["eip"]).eipPool.trim();
    if (!pool) errors = [{ field: "spec.network.nodes.external.eipPool", code: "required", message: "Enter the EIP pool. It has no default." }];
    else if (!CIDR.test(pool)) errors = [{ field: "spec.network.nodes.external.eipPool", code: "invalid", message: "Enter a CIDR such as 203.0.113.0/28." }];
  }
  if (step === "observability") {
    const url = (v as StepValues["observability"]).otlpEndpoint.trim();
    if (url && !/^https?:\/\/\S+$/.test(url)) errors = [{ field: "spec.observability.otlpEndpoint", code: "invalid", message: "Enter an http(s) URL, or leave it empty to turn exporting off." }];
  }
  return { errors, preflight: { ranAt, checks } };
}

export class InstallerApiError extends Error {
  constructor(readonly body: ApiError) {
    super(body.error.code);
  }
}

function fail(code: string, message: string, retryable = false): never {
  throw new InstallerApiError({ error: { code, message, retryable } });
}

// In-memory stand-in for the installer API. Same rules as vws-deploy#139:
// fixed step order (409 step_out_of_order), summary only when all valid,
// credential returned once (410 credential_consumed).
export function createMockInstaller() {
  let session: SessionState = "editing";
  let credentialTaken = false;
  const status = Object.fromEntries(STEP_IDS.map((s) => [s, s === "roles" ? "valid" : "pending"])) as Record<StepId, StepStatus>;
  const values: StepValues = {
    roles: {},
    network: { nodes: { tunnel: { nic: "" }, external: { nic: "" } } },
    storage: { driver: "rook-ceph" },
    eip: { eipPool: "" },
    profile: { profile: "single-node" },
    observability: { otlpEndpoint: "" },
  };

  return {
    state: () => ({ session, status: { ...status }, values: structuredClone(values) }),
    putStep<S extends StepId>(step: S, value: StepValues[S]): PutResult {
      if (session !== "editing" && session !== "failed") fail("install_in_progress", "Install already started.");
      if (!reachableSteps(status).includes(step)) fail("step_out_of_order", "Finish the earlier steps first.");
      session = "editing";
      const { errors, preflight } = validate(step, value);
      const blocked = errors.length > 0 || preflight.checks.some((c) => c.status === "fail" && c.severity === "error");
      values[step] = structuredClone(value);
      status[step] = blocked ? "invalid" : "valid";
      return { status: status[step], errors, preflight };
    },
    summary() {
      if (!summaryReady(status)) fail("step_out_of_order", "Every step must be valid first.");
      session = "confirming";
      const spec = {
        profile: values.profile.profile,
        storage: values.storage,
        network: { nodes: { ...values.network.nodes, external: { ...values.network.nodes.external, eipPool: values.eip.eipPool } } },
        observability: values.observability,
      };
      return { cr: { kind: "VWSCluster", spec }, specHash: JSON.stringify(spec), warnings: [] as string[] };
    },
    install(confirm: boolean, specHash: string) {
      if (!confirm) fail("bad_request", "Confirm the install.");
      if (specHash !== this.summary().specHash) fail("spec_changed", "Settings changed after the summary.");
      session = "installing";
      return MOCK_PHASES.map<ProgressEvent>((phase, i) => ({
        phase,
        index: i + 1,
        total: MOCK_PHASES.length,
        percent: Math.round(((i + 1) / MOCK_PHASES.length) * 100),
        state: "done",
      }));
    },
    finishInstall() {
      session = "succeeded";
    },
    result(): InstallerResult {
      // consoleUrl and adminUser are unknown until the real API reports it; the screen shows a dash.
      return { consoleUrl: "", adminUser: "", credentialAvailable: !credentialTaken };
    },
    takeCredential(): string {
      if (credentialTaken) fail("credential_consumed", "The initial password was already shown.");
      credentialTaken = true;
      session = "finished";
      return MOCK_CREDENTIAL;
    },
  };
}

export type MockInstaller = ReturnType<typeof createMockInstaller>;
