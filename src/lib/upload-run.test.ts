import { describe, expect, it, vi } from "vitest";
import { MAX_OBJECT_BYTES } from "@/lib/object-upload";
import type { ApiError } from "@/lib/vws-api/adapter";
import {
  canStart,
  initialRun,
  runUpload,
  summarize,
  uploadReducer,
  type UploadEvent,
  type UploadItem,
  type UploadRun,
} from "@/lib/upload-run";

const file = (name: string, size = 3) => new File([new Uint8Array(size)], name);
const oversize = (name: string) => {
  const big = file(name, 1);
  Object.defineProperty(big, "size", { value: MAX_OBJECT_BYTES + 1 });
  return big;
};
const okPut = () => vi.fn<(item: UploadItem) => Promise<ApiError | null>>(async () => null);
const denied: ApiError = { code: "AccessDenied", message: "Access Denied", requestId: "r-1" };

function reduce(...events: UploadEvent[]): UploadRun {
  return events.reduce(uploadReducer, initialRun);
}

const kinds = (run: UploadRun) => Object.fromEntries(run.items.map((item) => [item.key, item.status.kind]));

describe("add", () => {
  it("queues files under the prefix as pending", () => {
    const run = reduce({ type: "add", files: [file("a.txt"), file("b.txt")], prefix: "docs/" });
    expect(kinds(run)).toEqual({ "docs/a.txt": "pending", "docs/b.txt": "pending" });
    expect(run.skipped).toEqual([]);
    expect(canStart(run)).toBe(true);
  });

  it("skips a key already in the run and one repeated inside the selection, and reports them", () => {
    const first = reduce({ type: "add", files: [file("a.txt")], prefix: "" });
    const run = uploadReducer(first, { type: "add", files: [file("a.txt"), file("b.txt"), file("b.txt")], prefix: "" });
    expect(Object.keys(kinds(run))).toEqual(["a.txt", "b.txt"]);
    expect(run.skipped).toEqual(["a.txt", "b.txt"]);
  });

  it("clears the skipped notice on the next add and on start", () => {
    const dup = reduce(
      { type: "add", files: [file("a")], prefix: "" },
      { type: "add", files: [file("a")], prefix: "" },
    );
    expect(dup.skipped).toEqual(["a"]);
    expect(uploadReducer(dup, { type: "add", files: [file("b")], prefix: "" }).skipped).toEqual([]);
    expect(uploadReducer(dup, { type: "start" }).skipped).toEqual([]);
  });

  it("lands an oversize file as failed at once with the 4 MiB message", () => {
    const run = reduce({ type: "add", files: [oversize("big.bin")], prefix: "" });
    expect(run.items[0].status).toEqual({
      kind: "failed",
      error: { code: "InvalidArgument", message: "Objects larger than 4 MiB cannot be uploaded.", requestId: null },
    });
    expect(canStart(run)).toBe(false);
  });

  it("accepts a file at exactly the cap and an empty file", () => {
    const run = reduce({ type: "add", files: [file("empty", 0), file("cap", MAX_OBJECT_BYTES)], prefix: "" });
    expect(kinds(run)).toEqual({ empty: "pending", cap: "pending" });
  });

  it("fails a file whose destination key is invalid instead of sending it", () => {
    const run = reduce(
      { type: "add", files: [file("a.txt")], prefix: "../" },
      { type: "add", files: [file("b.txt")], prefix: "/abs/" },
      { type: "add", files: [file("c\u0000.txt")], prefix: "" },
      { type: "add", files: [file("d.txt")], prefix: "x".repeat(1025) },
    );
    expect(run.items.map((item) => item.status.kind)).toEqual(["failed", "failed", "failed", "failed"]);
    expect(canStart(run)).toBe(false);
  });

  it("treats hostile names as plain keys", () => {
    const run = reduce({
      type: "add",
      files: [file("<script>alert(1)</script>.txt"), file("a b%2F#?.txt")],
      prefix: "",
    });
    expect(kinds(run)).toEqual({ "<script>alert(1)</script>.txt": "pending", "a b%2F#?.txt": "pending" });
  });

  it("is ignored once the run is done", () => {
    const done: UploadRun = { phase: "done", items: [], skipped: [] };
    expect(uploadReducer(done, { type: "add", files: [file("a")], prefix: "" })).toBe(done);
  });
});

describe("remove", () => {
  const pending = reduce({ type: "add", files: [file("a"), file("b")], prefix: "" });

  it("drops a pending item and returns to idle when the list empties", () => {
    const one = uploadReducer(pending, { type: "remove", key: "a" });
    expect(Object.keys(kinds(one))).toEqual(["b"]);
    expect(uploadReducer(one, { type: "remove", key: "b" })).toEqual(initialRun);
  });

  it("does nothing while running, for a succeeded item, or for an unknown key", () => {
    const running = uploadReducer(pending, { type: "start" });
    expect(uploadReducer(running, { type: "remove", key: "a" })).toBe(running);
    const done = reduce(
      { type: "add", files: [file("a")], prefix: "" },
      { type: "start" },
      { type: "sent", key: "a" },
      { type: "settled", key: "a", error: null },
      { type: "finish" },
    );
    expect(uploadReducer(done, { type: "remove", key: "a" })).toBe(done);
    expect(uploadReducer(pending, { type: "remove", key: "nope" })).toBe(pending);
  });

  it("can drop a failed item after the run", () => {
    const failed = reduce(
      { type: "add", files: [file("a")], prefix: "" },
      { type: "start" },
      { type: "sent", key: "a" },
      { type: "settled", key: "a", error: denied },
      { type: "finish" },
    );
    expect(uploadReducer(failed, { type: "remove", key: "a" }).items).toEqual([]);
  });
});

describe("start, sent, settled, finish", () => {
  const queued = reduce({ type: "add", files: [file("a"), file("b")], prefix: "" });

  it("start twice is the same as once", () => {
    const running = uploadReducer(queued, { type: "start" });
    expect(running.phase).toBe("running");
    expect(uploadReducer(running, { type: "start" })).toBe(running);
    expect(canStart(running)).toBe(false);
  });

  it("start with nothing to send does nothing", () => {
    expect(uploadReducer(initialRun, { type: "start" })).toBe(initialRun);
  });

  it("moves an item through uploading to its outcome", () => {
    const run = reduce(
      { type: "add", files: [file("a"), file("b")], prefix: "" },
      { type: "start" },
      { type: "sent", key: "a" },
    );
    expect(kinds(run)).toEqual({ a: "uploading", b: "pending" });
    const settled = uploadReducer(run, { type: "settled", key: "a", error: denied });
    expect(settled.items[0].status).toEqual({ kind: "failed", error: denied });
  });

  it("ignores events that no longer apply", () => {
    const running = reduce({ type: "add", files: [file("a")], prefix: "" }, { type: "start" });
    expect(uploadReducer(running, { type: "settled", key: "a", error: null })).toBe(running);
    expect(uploadReducer(running, { type: "settled", key: "ghost", error: null })).toBe(running);
    expect(uploadReducer(running, { type: "sent", key: "ghost" })).toBe(running);
    expect(uploadReducer(queued, { type: "sent", key: "a" })).toBe(queued);
    expect(uploadReducer(queued, { type: "finish" })).toBe(queued);
  });

  it("never resends a succeeded item, and sent is refused for it", () => {
    const run = reduce(
      { type: "add", files: [file("a")], prefix: "" },
      { type: "start" },
      { type: "sent", key: "a" },
      { type: "settled", key: "a", error: null },
    );
    expect(uploadReducer(run, { type: "sent", key: "a" })).toBe(run);
    expect(uploadReducer(run, { type: "settled", key: "a", error: denied })).toBe(run);
  });

  it("finishes done when nothing is pending and idle when late files wait", () => {
    const base = reduce(
      { type: "add", files: [file("a")], prefix: "" },
      { type: "start" },
      { type: "add", files: [file("late")], prefix: "" },
      { type: "sent", key: "a" },
      { type: "settled", key: "a", error: null },
    );
    const finished = uploadReducer(base, { type: "finish" });
    expect(finished.phase).toBe("idle");
    expect(kinds(finished)).toEqual({ a: "succeeded", late: "pending" });
    expect(canStart(finished)).toBe(true);
    const clean = reduce(
      { type: "add", files: [file("a")], prefix: "" },
      { type: "start" },
      { type: "sent", key: "a" },
      { type: "settled", key: "a", error: null },
      { type: "finish" },
    );
    expect(clean.phase).toBe("done");
    expect(canStart(clean)).toBe(false);
  });

  it("retries a failed item after the run but not an unfixable one", () => {
    const done = reduce(
      { type: "add", files: [file("a"), oversize("big")], prefix: "" },
      { type: "start" },
      { type: "sent", key: "a" },
      { type: "settled", key: "a", error: denied },
      { type: "finish" },
    );
    expect(done.phase).toBe("done");
    expect(canStart(done)).toBe(true);
    const retry = uploadReducer(done, { type: "start" });
    expect(retry.phase).toBe("running");
    expect(uploadReducer(retry, { type: "sent", key: "big" })).toBe(retry);
    expect(kinds(uploadReducer(retry, { type: "sent", key: "a" }))).toEqual({ a: "uploading", big: "failed" });
  });
});

describe("summarize", () => {
  it("counts every status and the counts add up", () => {
    const status = (kind: UploadItem["status"]["kind"]): UploadItem["status"] =>
      kind === "failed" ? { kind, error: denied } : ({ kind } as UploadItem["status"]);
    const items: UploadItem[] = (["pending", "uploading", "succeeded", "succeeded", "failed"] as const).map(
      (kind, index) => ({ key: `k${index}`, file: file("f"), status: status(kind) }),
    );
    expect(summarize(items)).toEqual({ total: 5, pending: 1, uploading: 1, succeeded: 2, failed: 1 });
    expect(summarize([])).toEqual({ total: 0, pending: 0, uploading: 0, succeeded: 0, failed: 0 });
  });
});

describe("runUpload", () => {
  function harness(initial: UploadRun) {
    let run = initial;
    const events: UploadEvent[] = [];
    const send = (event: UploadEvent) => {
      events.push(event);
      run = uploadReducer(run, event);
    };
    return { send, events, current: () => run };
  }

  const queue = (...names: string[]) =>
    reduce({ type: "add", files: names.map((name) => file(name)), prefix: "p/" }, { type: "start" });

  it("sends every item in order and finishes done", async () => {
    const h = harness(queue("a", "b", "c"));
    const put = okPut();
    await runUpload(h.current(), h.send, put);
    expect(put.mock.calls.map(([item]) => item.key)).toEqual(["p/a", "p/b", "p/c"]);
    expect(h.current().phase).toBe("done");
    expect(summarize(h.current().items)).toMatchObject({ succeeded: 3, failed: 0, pending: 0 });
  });

  it("goes on after a failure and after a thrown action", async () => {
    const h = harness(queue("a", "b", "c"));
    const put = vi.fn(async (item: UploadItem) => {
      if (item.key === "p/a") return denied;
      if (item.key === "p/b") throw new Error("Body exceeded 1 MB limit");
      return null;
    });
    await runUpload(h.current(), h.send, put);
    expect(put).toHaveBeenCalledTimes(3);
    const [a, b, c] = h.current().items.map((item) => item.status);
    expect(a).toEqual({ kind: "failed", error: denied });
    expect(b).toEqual({
      kind: "failed",
      error: { code: "ServiceUnavailable", message: "The upload could not be sent.", requestId: null },
    });
    expect(c).toEqual({ kind: "succeeded" });
    expect(h.current().phase).toBe("done");
  });

  it("retry sends only the failed items", async () => {
    const h = harness(queue("a", "b"));
    await runUpload(h.current(), h.send, async (item) => (item.key === "p/a" ? denied : null));
    h.send({ type: "start" });
    const put = okPut();
    await runUpload(h.current(), h.send, put);
    expect(put.mock.calls.map(([item]) => item.key)).toEqual(["p/a"]);
    expect(summarize(h.current().items)).toMatchObject({ succeeded: 2, failed: 0 });
  });

  it("running again after everything succeeded sends nothing", async () => {
    const h = harness(queue("a"));
    await runUpload(h.current(), h.send, async () => null);
    const put = okPut();
    await runUpload(h.current(), h.send, put);
    expect(put).not.toHaveBeenCalled();
  });

  it("leaves files added mid-run pending for the next call", async () => {
    const h = harness(queue("a"));
    const put = vi.fn(async (item: UploadItem) => {
      if (item.key === "p/a") h.send({ type: "add", files: [file("late")], prefix: "p/" });
      return null;
    });
    await runUpload(h.current(), h.send, put);
    expect(put).toHaveBeenCalledTimes(1);
    expect(kinds(h.current())).toEqual({ "p/a": "succeeded", "p/late": "pending" });
    expect(h.current().phase).toBe("idle");
    h.send({ type: "start" });
    await runUpload(h.current(), h.send, put);
    expect(put.mock.calls.map(([item]) => item.key)).toEqual(["p/a", "p/late"]);
  });

  it("starts no further file and sends no finish once the caller is gone", async () => {
    const h = harness(queue("a", "b", "c"));
    let active = true;
    const put = vi.fn<(item: UploadItem) => Promise<ApiError | null>>(async () => {
      active = false;
      return null;
    });
    await runUpload(h.current(), h.send, put, () => active);
    expect(put).toHaveBeenCalledTimes(1);
    expect(kinds(h.current())).toEqual({ "p/a": "succeeded", "p/b": "pending", "p/c": "pending" });
    expect(h.events.some((event) => event.type === "finish")).toBe(false);
  });

  it("does not call put for an unfixable failed item or an empty run", async () => {
    const h = harness(reduce({ type: "add", files: [oversize("big")], prefix: "" }));
    const put = okPut();
    await runUpload(h.current(), h.send, put);
    expect(put).not.toHaveBeenCalled();
  });
});
