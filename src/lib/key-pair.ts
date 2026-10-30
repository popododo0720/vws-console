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

export type KeyPairChoice =
  { kind: "unset" } | { kind: "opt-out" } | { kind: "none" } | { kind: "pair"; name: KeyPairName };

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
const PENDING_NAMES_KEY = "vws.key-pair-pending-names";
const NAME_INVALID = "Enter a key pair name of 1 to 255 ASCII characters. It cannot start or end with a space.";
const PRIVATE_KEY_REJECTED = "Enter a public key. A private key is not accepted.";
const PRIVATE_KEY_MATERIAL = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;

function invalid(message: string): ApiError {
  return { code: "InvalidArgument", message, requestId: null };
}

function isPrivateKey(value: string): boolean {
  const text = value.trim();
  return PRIVATE_KEY_MATERIAL.test(text) || text.startsWith("PuTTY-User-Key-File-");
}

export function parseKeyPairId(value: string): KeyPairId | null {
  return KEY_PAIR_ID.test(value) ? (value as KeyPairId) : null;
}

export function parseKeyPairName(value: string): KeyPairName | null {
  if (value.length < 1 || value.length > 255) return null;
  if (value.startsWith(" ") || value.endsWith(" ")) return null;
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 127) return null;
  }
  return value as KeyPairName;
}

export function parseIdempotencyKey(value: string): IdempotencyKey | null {
  return IDEMPOTENCY_KEY.test(value) ? (value as IdempotencyKey) : null;
}

export function publicKeyError(value: string): ApiError | null {
  if (isPrivateKey(value)) return invalid(PRIVATE_KEY_REJECTED);
  if (value.trim() === "") return invalid("Enter a public key.");
  return null;
}

export function parseDraft(input: {
  mode: "generate" | "import";
  name: string;
  keyType: KeyType;
  keyFormat: KeyFormat;
  publicKey: string;
}): { ok: true; value: KeyPairDraft } | { ok: false; error: ApiError } {
  if (input.mode === "import" && isPrivateKey(input.publicKey)) {
    return { ok: false, error: invalid(PRIVATE_KEY_REJECTED) };
  }
  const name = parseKeyPairName(input.name);
  if (!name) return { ok: false, error: invalid(NAME_INVALID) };
  if (input.mode === "import") {
    const error = publicKeyError(input.publicKey);
    if (error) return { ok: false, error };
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
  if (draft.mode === "import" && isPrivateKey(draft.publicKey)) {
    throw new Error("A private key cannot be stored.");
  }
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
  if (!name) return invalid(NAME_INVALID);
  if ("publicKeyMaterial" in record) {
    if ("keyType" in record || "keyFormat" in record) return invalid("The key pair request could not be read.");
    if (typeof record.publicKeyMaterial !== "string" || record.publicKeyMaterial.trim() === "") {
      return invalid("Enter a public key.");
    }
    if (isPrivateKey(record.publicKeyMaterial)) return invalid(PRIVATE_KEY_REJECTED);
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

export function scrubKeyEquivalentStorage(): void {
  const bin = storage();
  if (!bin) return;
  const doomed: string[] = [];
  for (let index = 0; index < bin.length; index += 1) {
    const storageKey = bin.key(index);
    if (storageKey?.startsWith(RECEIPT_PREFIX)) doomed.push(storageKey);
  }
  for (const storageKey of doomed) bin.removeItem(storageKey);
}

function readNames(): KeyPairName[] {
  const raw = storage()?.getItem(PENDING_NAMES_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const name = typeof item === "string" ? parseKeyPairName(item) : null;
      return name ? [name] : [];
    });
  } catch {
    return [];
  }
}

function writeNames(names: readonly KeyPairName[]): void {
  const bin = storage();
  if (!bin) throw new Error("The browser could not store the key pair name.");
  const unique = [...new Set(names)];
  if (unique.length === 0) bin.removeItem(PENDING_NAMES_KEY);
  else bin.setItem(PENDING_NAMES_KEY, JSON.stringify(unique));
}

export function readPendingNames(): KeyPairName[] {
  scrubKeyEquivalentStorage();
  return readNames();
}

export function forgetPendingName(name: string): void {
  const parsed = parseKeyPairName(name);
  if (!parsed) return;
  writeNames(readNames().filter((item) => item !== parsed));
}

export function browserReceiptStore(): ReceiptStore {
  return {
    read() {
      scrubKeyEquivalentStorage();
      return null;
    },
    write(attempt) {
      scrubKeyEquivalentStorage();
      const draft = readAttempt(attempt);
      if ("code" in draft) throw new Error("The key pair request could not be stored.");
      if (draft.mode === "import") return;
      writeNames([...readNames(), draft.name]);
    },
    delete() {
      scrubKeyEquivalentStorage();
    },
    list() {
      scrubKeyEquivalentStorage();
      return [];
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

export function createFailureMessage(attempt: CreateAttempt, error: ApiError): string {
  if (error.code !== "AlreadyExists") return error.message;
  const draft = readAttempt(attempt);
  if ("code" in draft || draft.mode !== "generate") return error.message;
  return `The key pair '${draft.name}' already exists. Its private key cannot be downloaded again. Delete the key pair, then create a new one.`;
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

export function deleteBatchError(error: ApiError): ApiError | null {
  return error.code === "NotFound" ? null : error;
}
