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

export function parseKeyPairId(value: string): KeyPairId | null {
  void value;
  throw new Error("not implemented");
}

export function parseKeyPairName(value: string): KeyPairName | null {
  void value;
  throw new Error("not implemented");
}

export function parseIdempotencyKey(value: string): IdempotencyKey | null {
  void value;
  throw new Error("not implemented");
}

export function parseDraft(input: {
  mode: "generate" | "import";
  name: string;
  keyType: KeyType;
  keyFormat: KeyFormat;
  publicKey: string;
}): { ok: true; value: KeyPairDraft } | { ok: false; error: ApiError } {
  void input;
  throw new Error("not implemented");
}

export function commitAttempt(store: ReceiptStore, draft: KeyPairDraft): CreateAttempt {
  void store;
  void draft;
  throw new Error("not implemented");
}

export function readAttempt(attempt: CreateAttempt): KeyPairDraft | ApiError {
  void attempt;
  throw new Error("not implemented");
}

export function memoryReceiptStore(): ReceiptStore {
  throw new Error("not implemented");
}

export function browserReceiptStore(): ReceiptStore {
  throw new Error("not implemented");
}

export function finishCreate(attempt: CreateAttempt, result: KeyPairCreateResult): CreateTransition {
  void attempt;
  void result;
  throw new Error("not implemented");
}

export function acknowledgeDownload(attempt: CreateAttempt): CreateTransition {
  void attempt;
  throw new Error("not implemented");
}

export function discardAttempt(attempt: CreateAttempt): CreateTransition {
  void attempt;
  throw new Error("not implemented");
}

export function acceptsNewAttempt(dialog: KeyPairDialog): boolean {
  void dialog;
  throw new Error("not implemented");
}

export function submitAttempt(dialog: KeyPairDialog, store: ReceiptStore, draft: KeyPairDraft): CreateAttempt | null {
  void dialog;
  void store;
  void draft;
  throw new Error("not implemented");
}

export function downloadPrivateKey(file: PrivateKeyFile): boolean {
  void file;
  throw new Error("not implemented");
}

export function privateKeyFileName(name: string, format: KeyFormat): string {
  void name;
  void format;
  throw new Error("not implemented");
}

/** NotFound means the id is already gone. Any other error stops the batch. */
export function deleteBatchError(error: ApiError): ApiError | null {
  void error;
  throw new Error("not implemented");
}
