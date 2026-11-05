import { fileProblem, objectKeyProblem } from "@/lib/object-upload";
import type { ApiError } from "@/lib/vws-api/adapter";

export type UploadStatus =
  { kind: "pending" } | { kind: "uploading" } | { kind: "succeeded" } | { kind: "failed"; error: ApiError };

/** The key is the identity: one destination cannot appear twice in a run. */
export type UploadItem = { key: string; file: File; status: UploadStatus };

export type UploadRun = {
  phase: "idle" | "running" | "done";
  items: UploadItem[];
  /** Destination keys the last `add` left out because they were already in the run. */
  skipped: string[];
};

export type UploadEvent =
  | { type: "add"; files: readonly File[]; prefix: string }
  | { type: "remove"; key: string }
  | { type: "start" }
  | { type: "sent"; key: string }
  | { type: "settled"; key: string; error: ApiError | null }
  | { type: "finish" };

export const initialRun: UploadRun = { phase: "idle", items: [], skipped: [] };

export type UploadSummary = { total: number; succeeded: number; failed: number; pending: number; uploading: number };

/** A problem the console can see before sending anything. Retrying such an item cannot succeed. */
function localProblem(item: Pick<UploadItem, "key" | "file">): ApiError | null {
  const keyProblem = objectKeyProblem(item.key);
  if (keyProblem) return { code: "InvalidArgument", message: keyProblem, requestId: null };
  return fileProblem(item.file);
}

/** Pending, or failed for a reason a resend could fix. A succeeded item is never sent again. */
function sendable(item: UploadItem): boolean {
  return item.status.kind === "pending" || (item.status.kind === "failed" && localProblem(item) === null);
}

export function canStart(run: UploadRun): boolean {
  return run.phase !== "running" && run.items.some(sendable);
}

export function summarize(items: readonly UploadItem[]): UploadSummary {
  const summary: UploadSummary = { total: items.length, succeeded: 0, failed: 0, pending: 0, uploading: 0 };
  for (const item of items) {
    if (item.status.kind === "succeeded") summary.succeeded += 1;
    else if (item.status.kind === "failed") summary.failed += 1;
    else if (item.status.kind === "uploading") summary.uploading += 1;
    else summary.pending += 1;
  }
  return summary;
}

function setStatus(run: UploadRun, key: string, from: (item: UploadItem) => UploadStatus | null): UploadRun {
  let changed = false;
  const items = run.items.map((item) => {
    if (item.key !== key) return item;
    const status = from(item);
    if (!status) return item;
    changed = true;
    return { ...item, status };
  });
  return changed ? { ...run, items } : run;
}

function add(run: UploadRun, files: readonly File[], prefix: string): UploadRun {
  if (run.phase === "done") return run;
  const seen = new Set(run.items.map((item) => item.key));
  const items = [...run.items];
  const skipped: string[] = [];
  for (const file of files) {
    const key = `${prefix}${file.name}`;
    if (seen.has(key)) {
      skipped.push(key);
      continue;
    }
    seen.add(key);
    const problem = localProblem({ key, file });
    items.push({ key, file, status: problem ? { kind: "failed", error: problem } : { kind: "pending" } });
  }
  return { ...run, items, skipped };
}

export function uploadReducer(run: UploadRun, event: UploadEvent): UploadRun {
  switch (event.type) {
    case "add":
      return add(run, event.files, event.prefix);
    case "remove": {
      const target = run.items.find((item) => item.key === event.key);
      // A running snapshot still holds its pending items, so nothing leaves the list mid-run.
      if (!target || run.phase === "running" || target.status.kind === "succeeded") return run;
      const items = run.items.filter((item) => item !== target);
      return { ...run, items, phase: items.length === 0 ? "idle" : run.phase };
    }
    case "start":
      return canStart(run) ? { ...run, phase: "running", skipped: [] } : run;
    case "sent":
      if (run.phase !== "running") return run;
      return setStatus(run, event.key, (item) => (sendable(item) ? { kind: "uploading" } : null));
    case "settled":
      return setStatus(run, event.key, (item) =>
        item.status.kind !== "uploading"
          ? null
          : event.error
            ? { kind: "failed", error: event.error }
            : { kind: "succeeded" },
      );
    case "finish":
      if (run.phase !== "running") return run;
      return { ...run, phase: run.items.some((item) => item.status.kind === "pending") ? "idle" : "done" };
  }
}

const SEND_FAILED: ApiError = { code: "ServiceUnavailable", message: "The upload could not be sent.", requestId: null };

/**
 * Sends the snapshot's pending and retryable failed items one at a time, in order. A failure never stops
 * the rest. Items added after the snapshot stay pending for the next call. Once `isActive` turns false no
 * further file starts and no `finish` is sent: the caller has gone away.
 */
export async function runUpload(
  run: UploadRun,
  send: (event: UploadEvent) => void,
  put: (item: UploadItem) => Promise<ApiError | null>,
  isActive: () => boolean = () => true,
): Promise<void> {
  for (const item of run.items.filter(sendable)) {
    if (!isActive()) return;
    send({ type: "sent", key: item.key });
    let error: ApiError | null;
    try {
      error = await put(item);
    } catch {
      error = SEND_FAILED;
    }
    send({ type: "settled", key: item.key, error });
  }
  if (isActive()) send({ type: "finish" });
}
