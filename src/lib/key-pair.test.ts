import { afterEach, describe, expect, it } from "vitest";
import type { ApiError } from "@/lib/vws-api/adapter";
import {
  acknowledgeDownload,
  acceptsNewAttempt,
  commitAttempt,
  deleteBatchError,
  discardAttempt,
  finishCreate,
  memoryReceiptStore,
  parseDraft,
  parseKeyPairId,
  privateKeyFileName,
  readAttempt,
  submitAttempt,
  browserReceiptStore,
  type CreateAttempt,
  type IdempotencyKey,
  type KeyPairDialog,
  type KeyPairDraft,
  type KeyPairId,
  type KeyPairName,
  type PrivateKeyFile,
  type StoredKeyPair,
} from "@/lib/key-pair";

const notFound: ApiError = { code: "NotFound", message: "gone", requestId: null };
const conflict: ApiError = { code: "Conflict", message: "busy", requestId: "r-1" };

const pair: StoredKeyPair = {
  id: "key-01234567" as KeyPairId,
  name: "web" as KeyPairName,
  fingerprint: "fp",
  type: "rsa",
  ownerId: "1",
};

const file: PrivateKeyFile = { fileName: "web.pem", material: "SECRET", format: "pem" };

const attempt: CreateAttempt = { idempotencyKey: "attempt-1" as IdempotencyKey, body: "{}" };

function generateDraft(name: string): KeyPairDraft {
  return { mode: "generate", name: name as KeyPairName, keyType: "rsa", keyFormat: "pem" };
}

describe("key pair rules", () => {
  afterEach(() => localStorage.clear());

  it("rejects an empty name, a 256 byte name, and an empty public key", () => {
    expect(parseDraft({ mode: "generate", name: "", keyType: "rsa", keyFormat: "pem", publicKey: "" }).ok).toBe(false);
    expect(
      parseDraft({ mode: "generate", name: "a".repeat(256), keyType: "rsa", keyFormat: "pem", publicKey: "" }).ok,
    ).toBe(false);
    expect(
      parseDraft({ mode: "generate", name: "é".repeat(128), keyType: "rsa", keyFormat: "pem", publicKey: "" }).ok,
    ).toBe(false);
    const fit = parseDraft({
      mode: "generate",
      name: "a".repeat(255),
      keyType: "rsa",
      keyFormat: "pem",
      publicKey: "",
    });
    expect(fit.ok).toBe(true);
    const multibyte = parseDraft({
      mode: "generate",
      name: "é".repeat(127),
      keyType: "ed25519",
      keyFormat: "ppk",
      publicKey: "",
    });
    expect(multibyte.ok).toBe(true);
    expect(parseDraft({ mode: "import", name: "laptop", keyType: "rsa", keyFormat: "pem", publicKey: "" }).ok).toBe(
      false,
    );
    expect(parseDraft({ mode: "import", name: "laptop", keyType: "rsa", keyFormat: "pem", publicKey: "   " }).ok).toBe(
      false,
    );
    const imported = parseDraft({
      mode: "import",
      name: "laptop",
      keyType: "rsa",
      keyFormat: "pem",
      publicKey: "ssh-ed25519 AAAA",
    });
    expect(imported.ok).toBe(true);
  });

  it("accepts a key pair id of 8 to 17 hex digits and rejects a name", () => {
    expect(parseKeyPairId("key-01234567")).toBe("key-01234567");
    expect(parseKeyPairId("key-0123456789abcdef0")).toBe("key-0123456789abcdef0");
    expect(parseKeyPairId("admin")).toBeNull();
    expect(parseKeyPairId("key-zzzzzzzz")).toBeNull();
    expect(parseKeyPairId("key-0123456")).toBeNull();
    expect(parseKeyPairId("key-0123456789abcdef01")).toBeNull();
  });

  it("keeps the attempt readable after commitAttempt returns, before any POST", () => {
    const seen: CreateAttempt[] = [];
    const store = memoryReceiptStore();
    const wrapped = {
      ...store,
      write(value: CreateAttempt) {
        store.write(value);
        const stored = store.read(value.idempotencyKey);
        if (stored) seen.push(stored);
      },
    };
    const parsed = parseDraft({ mode: "generate", name: "web", keyType: "rsa", keyFormat: "pem", publicKey: "" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const created = commitAttempt(wrapped, parsed.value);
    expect(seen).toEqual([created]);
    expect(store.read(created.idempotencyKey)).toEqual(created);
    expect(created.body).toBe('{"keyName":"web","keyType":"rsa","keyFormat":"pem"}');
    const again = commitAttempt(store, parsed.value);
    expect(again.idempotencyKey).not.toBe(created.idempotencyKey);
    expect(again.body).toBe(created.body);
  });

  it("round-trips generate and import bodies and does not trim the name", () => {
    const store = memoryReceiptStore();
    const generated = parseDraft({
      mode: "generate",
      name: " web",
      keyType: "ed25519",
      keyFormat: "ppk",
      publicKey: "",
    });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const generateAttempt = commitAttempt(store, generated.value);
    expect(generateAttempt.body).toBe('{"keyName":" web","keyType":"ed25519","keyFormat":"ppk"}');
    expect(readAttempt(generateAttempt)).toEqual(generated.value);

    const imported = parseDraft({
      mode: "import",
      name: "laptop",
      keyType: "rsa",
      keyFormat: "pem",
      publicKey: "  ssh-ed25519 AAAA  ",
    });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const importAttempt = commitAttempt(store, imported.value);
    expect(importAttempt.body).toBe('{"keyName":"laptop","publicKeyMaterial":"ssh-ed25519 AAAA"}');
    expect(JSON.parse(importAttempt.body)).not.toHaveProperty("keyType");
    expect(JSON.parse(importAttempt.body)).not.toHaveProperty("keyFormat");
    expect(readAttempt(importAttempt)).toEqual({ mode: "import", name: "laptop", publicKey: "ssh-ed25519 AAAA" });
  });

  it("stores one localStorage entry per attempt and no private key bytes", () => {
    const store = browserReceiptStore();
    const parsed = parseDraft({ mode: "generate", name: "web", keyType: "rsa", keyFormat: "pem", publicKey: "" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const created = commitAttempt(store, parsed.value);
    const raw = localStorage.getItem(`vws.key-pair-receipt.${created.idempotencyKey}`);
    expect(raw).toContain(created.body);
    expect(raw).not.toContain("keyMaterial");
    expect(store.read(created.idempotencyKey)).toEqual(created);
    const second = commitAttempt(store, parsed.value);
    expect(localStorage.getItem(`vws.key-pair-receipt.${second.idempotencyKey}`)).toContain(second.body);
    expect(store.list()).toHaveLength(2);
  });

  it("follows the create result table", () => {
    const ready = finishCreate(attempt, {
      status: "ready",
      issued: { keyPair: pair, privateKey: file, settlement: "succeeded" },
    });
    expect(ready.effect).toBe("keep");
    expect(ready.published).toEqual(pair);
    expect(ready.dialog).toMatchObject({ step: "download", file, error: null });

    const waiting = finishCreate(attempt, {
      status: "ready",
      issued: { keyPair: pair, privateKey: file, settlement: "still-running" },
    });
    expect(waiting.effect).toBe("keep");
    expect(waiting.dialog).toMatchObject({ step: "download", settlement: "still-running" });

    const imported = finishCreate(attempt, {
      status: "ready",
      issued: { keyPair: pair, privateKey: null, settlement: "succeeded" },
    });
    expect(imported).toEqual({ dialog: { step: "closed" }, effect: "forget", published: pair });

    const failedFile = finishCreate(attempt, {
      status: "failed",
      error: conflict,
      issued: { keyPair: pair, privateKey: file, settlement: "succeeded" },
    });
    expect(failedFile.effect).toBe("keep");
    expect(failedFile.dialog).toMatchObject({ step: "download", error: conflict, file });

    const failed = finishCreate(attempt, { status: "failed", error: conflict, issued: null });
    expect(failed).toEqual({
      dialog: { step: "error", attempt, error: conflict },
      effect: "keep",
      published: null,
    });

    expect(acknowledgeDownload(attempt)).toEqual({ dialog: { step: "closed" }, effect: "forget", published: null });
    expect(discardAttempt(attempt)).toEqual({ dialog: { step: "closed" }, effect: "forget", published: null });
  });

  it("does not commit a second submit while the dialog is not on the form step", () => {
    const store = memoryReceiptStore();
    const draft = generateDraft("web");
    const steps: KeyPairDialog[] = [
      { step: "closed" },
      { step: "saving", attempt },
      {
        step: "download",
        attempt,
        file,
        keyPair: pair,
        settlement: "succeeded",
        error: null,
      },
      { step: "error", attempt, error: conflict },
    ];
    for (const dialog of steps) {
      expect(acceptsNewAttempt(dialog)).toBe(false);
      expect(submitAttempt(dialog, store, draft)).toBeNull();
    }
    expect(store.list()).toEqual([]);
    const form: KeyPairDialog = {
      step: "form",
      mode: "generate",
      name: "web",
      keyType: "rsa",
      keyFormat: "pem",
      publicKey: "",
      error: null,
    };
    expect(acceptsNewAttempt(form)).toBe(true);
    const created = submitAttempt(form, store, draft);
    expect(created?.body).toBe('{"keyName":"web","keyType":"rsa","keyFormat":"pem"}');
    expect(store.list()).toEqual([created]);
  });

  it("replaces separators in the private key file name and keeps the format", () => {
    expect(privateKeyFileName("../web", "pem")).toBe(".._web.pem");
    expect(privateKeyFileName("../web", "ppk")).toBe(".._web.ppk");
  });

  it("treats NotFound as success and stops on any other delete error", () => {
    expect(deleteBatchError(notFound)).toBeNull();
    expect(deleteBatchError(conflict)).toEqual(conflict);
  });
});
