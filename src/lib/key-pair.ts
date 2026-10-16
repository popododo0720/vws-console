import type { ApiError } from "@/lib/vws-api/adapter";

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type KeyPairId = Brand<string, "KeyPairId">;
export type KeyPairName = Brand<string, "KeyPairName">;
export type IdempotencyKey = Brand<string, "IdempotencyKey">;

export type KeyType = "rsa" | "ed25519";
export type KeyFormat = "pem" | "ppk";

export const KEY_TYPE_OPTIONS: readonly { value: KeyType; label: string; description: string }[] = [
  { value: "rsa", label: "RSA", description: "RSA encrypted private and public key pair" },
  { value: "ed25519", label: "ED25519", description: "ED25519 encrypted private and public key pair" },
];

export const KEY_FORMAT_OPTIONS: readonly { value: KeyFormat; label: string; description: string }[] = [
  { value: "pem", label: ".pem", description: "For use with OpenSSH" },
  { value: "ppk", label: ".ppk", description: "For use with PuTTY" },
];

export type StoredKeyPair = {
  id: KeyPairId;
  name: KeyPairName;
  fingerprint: string;
  type: string;
  ownerId: string;
};

export type KeyPairDraft =
  | { mode: "generate"; name: KeyPairName; keyType: KeyType; keyFormat: KeyFormat }
  | { mode: "import"; name: KeyPairName; publicKey: string };

/** Replay token. `body` is the exact POST string. The private key is never stored here. */
export type CreateAttempt = {
  idempotencyKey: IdempotencyKey;
  body: string;
};

export type PrivateKeyFile = {
  fileName: string;
  material: string;
  format: KeyFormat;
};

export type Settlement = "succeeded" | "still-running";

export type IssuedKeyPair = {
  keyPair: StoredKeyPair;
  privateKey: PrivateKeyFile | null;
  settlement: Settlement;
};

export type KeyPairCreateResult =
  { status: "ready"; issued: IssuedKeyPair } | { status: "failed"; error: ApiError; issued: IssuedKeyPair | null };

export type KeyPairChoice = { kind: "none" } | { kind: "pair"; name: KeyPairName };

export type KeyPairDialog =
  | { step: "closed" }
  | {
      step: "form";
      mode: "generate" | "import";
      name: string;
      keyType: KeyType;
      keyFormat: KeyFormat;
      publicKey: string;
      error: ApiError | null;
    }
  | { step: "saving"; attempt: CreateAttempt }
  | {
      step: "download";
      attempt: CreateAttempt;
      file: PrivateKeyFile;
      keyPair: StoredKeyPair;
      settlement: Settlement;
      error: ApiError | null;
    }
  | { step: "error"; attempt: CreateAttempt; error: ApiError };

export type ReceiptStore = {
  read(key: IdempotencyKey): CreateAttempt | null;
  write(attempt: CreateAttempt): void;
  delete(key: IdempotencyKey): void;
  list(): CreateAttempt[];
};

export type CreateTransition = {
  dialog: KeyPairDialog;
  effect: "keep" | "forget";
  published: StoredKeyPair | null;
};

const KEY_PAIR_ID = /^key-[0-9a-f]{8,17}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const RECEIPT_PREFIX = "vws.key-pair-receipt.";

function invalid(message: string): ApiError {
  return { code: "InvalidArgument", message, requestId: null };
}

export function parseKeyPairId(value: string): KeyPairId | null {
  return KEY_PAIR_ID.test(value) ? (value as KeyPairId) : null;
}

export function parseKeyPairName(value: string): KeyPairName | null {
  const bytes = new TextEncoder().encode(value).length;
  if (bytes < 1 || bytes > 255) return null;
  return value as KeyPairName;
}

export function parseIdempotencyKey(value: string): IdempotencyKey | null {
  return IDEMPOTENCY_KEY.test(value) ? (value as IdempotencyKey) : null;
}

export function parseDraft(input: {
  mode: "generate" | "import";
  name: string;
  keyType: KeyType;
  keyFormat: KeyFormat;
  publicKey: string;
}): { ok: true; value: KeyPairDraft } | { ok: false; error: ApiError } {
  const name = parseKeyPairName(input.name);
  if (!name) return { ok: false, error: invalid("Enter a key pair name of 1 to 255 bytes.") };
  if (input.mode === "import") {
    if (input.publicKey.trim() === "") return { ok: false, error: invalid("Enter a public key.") };
    return { ok: true, value: { mode: "import", name, publicKey: input.publicKey } };
  }
  return { ok: true, value: { mode: "generate", name, keyType: input.keyType, keyFormat: input.keyFormat } };
}

function attemptBody(draft: KeyPairDraft): string {
  if (draft.mode === "generate") {
    return JSON.stringify({ keyName: draft.name, keyType: draft.keyType, keyFormat: draft.keyFormat });
  }
  return JSON.stringify({ keyName: draft.name, publicKeyMaterial: draft.publicKey.trim() });
}

export function commitAttempt(store: ReceiptStore, draft: KeyPairDraft): CreateAttempt {
  const idempotencyKey = parseIdempotencyKey(crypto.randomUUID());
  if (!idempotencyKey) throw new Error("The idempotency key could not be minted.");
  const attempt = { idempotencyKey, body: attemptBody(draft) };
  store.write(attempt);
  return attempt;
}

export function readAttempt(attempt: CreateAttempt): KeyPairDraft | ApiError {
  if (!parseIdempotencyKey(attempt.idempotencyKey)) return invalid("The idempotency key is not valid.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(attempt.body);
  } catch {
    return invalid("The key pair request could not be read.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return invalid("The key pair request could not be read.");
  }
  const record = parsed as Record<string, unknown>;
  const name = typeof record.keyName === "string" ? parseKeyPairName(record.keyName) : null;
  if (!name) return invalid("Enter a key pair name of 1 to 255 bytes.");
  if ("publicKeyMaterial" in record) {
    if ("keyType" in record || "keyFormat" in record) return invalid("The key pair request could not be read.");
    if (typeof record.publicKeyMaterial !== "string" || record.publicKeyMaterial.trim() === "") {
      return invalid("Enter a public key.");
    }
    return { mode: "import", name, publicKey: record.publicKeyMaterial.trim() };
  }
  if (record.keyType !== "rsa" && record.keyType !== "ed25519") {
    return invalid("The key pair request could not be read.");
  }
  if (record.keyFormat !== "pem" && record.keyFormat !== "ppk") {
    return invalid("The key pair request could not be read.");
  }
  return { mode: "generate", name, keyType: record.keyType, keyFormat: record.keyFormat };
}

export function memoryReceiptStore(): ReceiptStore {
  const entries = new Map<IdempotencyKey, CreateAttempt>();
  return {
    read(key) {
      return entries.get(key) ?? null;
    },
    write(attempt) {
      entries.set(attempt.idempotencyKey, attempt);
    },
    delete(key) {
      entries.delete(key);
    },
    list() {
      return [...entries.values()];
    },
  };
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function storedAttempt(body: string, key: IdempotencyKey): CreateAttempt | null {
  const attempt = { idempotencyKey: key, body };
  const draft = readAttempt(attempt);
  if ("code" in draft) return null;
  return attempt;
}

export function browserReceiptStore(): ReceiptStore {
  return {
    read(key) {
      const raw = storage()?.getItem(RECEIPT_PREFIX + key);
      return raw ? storedAttempt(raw, key) : null;
    },
    write(attempt) {
      const bin = storage();
      if (!bin) throw new Error("The browser could not store the key pair request.");
      bin.setItem(RECEIPT_PREFIX + attempt.idempotencyKey, attempt.body);
    },
    delete(key) {
      storage()?.removeItem(RECEIPT_PREFIX + key);
    },
    list() {
      const bin = storage();
      if (!bin) return [];
      const out: CreateAttempt[] = [];
      for (let index = 0; index < bin.length; index += 1) {
        const storageKey = bin.key(index);
        if (!storageKey?.startsWith(RECEIPT_PREFIX)) continue;
        const idempotencyKey = parseIdempotencyKey(storageKey.slice(RECEIPT_PREFIX.length));
        if (!idempotencyKey) continue;
        const raw = bin.getItem(storageKey);
        if (!raw) continue;
        const attempt = storedAttempt(raw, idempotencyKey);
        if (attempt) out.push(attempt);
      }
      return out;
    },
  };
}

function closed(published: StoredKeyPair | null, effect: "keep" | "forget"): CreateTransition {
  return { dialog: { step: "closed" }, effect, published };
}

export function finishCreate(attempt: CreateAttempt, result: KeyPairCreateResult): CreateTransition {
  if (result.status === "ready" && result.issued.privateKey) {
    return {
      dialog: {
        step: "download",
        attempt,
        file: result.issued.privateKey,
        keyPair: result.issued.keyPair,
        settlement: result.issued.settlement,
        error: null,
      },
      effect: "keep",
      published: result.issued.keyPair,
    };
  }
  if (result.status === "ready") return closed(result.issued.keyPair, "forget");
  if (result.issued?.privateKey) {
    return {
      dialog: {
        step: "download",
        attempt,
        file: result.issued.privateKey,
        keyPair: result.issued.keyPair,
        settlement: result.issued.settlement,
        error: result.error,
      },
      effect: "keep",
      published: result.issued.keyPair,
    };
  }
  return {
    dialog: { step: "error", attempt, error: result.error },
    effect: "keep",
    published: result.issued ? result.issued.keyPair : null,
  };
}

export function acknowledgeDownload(attempt: CreateAttempt): CreateTransition {
  void attempt;
  return closed(null, "forget");
}

export function discardAttempt(attempt: CreateAttempt): CreateTransition {
  void attempt;
  return closed(null, "forget");
}

export function acceptsNewAttempt(dialog: KeyPairDialog): boolean {
  return dialog.step === "form";
}

export function submitAttempt(dialog: KeyPairDialog, store: ReceiptStore, draft: KeyPairDraft): CreateAttempt | null {
  if (!acceptsNewAttempt(dialog)) return null;
  return commitAttempt(store, draft);
}

export function privateKeyFileName(name: string, format: KeyFormat): string {
  return `${name.replace(/[^A-Za-z0-9._-]/g, "_")}.${format}`;
}

export function downloadPrivateKey(file: PrivateKeyFile): boolean {
  if (typeof document === "undefined") return false;
  try {
    const url = URL.createObjectURL(new Blob([file.material], { type: "application/octet-stream" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = file.fileName;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

/** A removed key pair is already gone. Any other error stops the rest of the batch. */
export function deleteBatchError(error: ApiError): ApiError | null {
  return error.code === "NotFound" ? null : error;
}
