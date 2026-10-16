"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createKeyPairAction } from "@/app/actions/resources";
import {
  KEY_FORMAT_OPTIONS,
  KEY_TYPE_OPTIONS,
  acknowledgeDownload,
  acceptsNewAttempt,
  browserReceiptStore,
  commitAttempt,
  discardAttempt,
  downloadPrivateKey,
  finishCreate,
  parseDraft,
  type CreateAttempt,
  type CreateTransition,
  type KeyFormat,
  type KeyPairDialog,
  type KeyType,
  type StoredKeyPair,
} from "@/lib/key-pair";
import { FieldLabel, OrangeButton, OutlineButton, PanelDialog } from "@/components/sites/console/ui";

const emptyForm = {
  name: "",
  keyType: KEY_TYPE_OPTIONS[0].value,
  keyFormat: KEY_FORMAT_OPTIONS[0].value,
  publicKey: "",
  error: null,
};

const noReceipts: CreateAttempt[] = [];
let receiptSnapshot = noReceipts;
let receiptText = "";
const receiptListeners = new Set<() => void>();

function readReceipts(): CreateAttempt[] {
  const next = browserReceiptStore().list();
  const text = next.map((item) => `${item.idempotencyKey}\n${item.body}`).join("\n");
  if (text === receiptText) return receiptSnapshot;
  receiptText = text;
  receiptSnapshot = next;
  return receiptSnapshot;
}

function subscribeReceipts(listener: () => void) {
  receiptListeners.add(listener);
  return () => receiptListeners.delete(listener);
}

function publishReceipts() {
  receiptText = "";
  for (const listener of receiptListeners) listener();
}

export function useKeyPairCreator(options: { onCreated: (keyPair: StoredKeyPair) => void }): {
  openGenerate: () => void;
  openImport: () => void;
  portal: ReactNode;
} {
  const dialogRef = useRef<KeyPairDialog>({ step: "closed" });
  const gate = useRef(false);
  const [dialog, setDialog] = useState<KeyPairDialog>({ step: "closed" });
  const receipts = useSyncExternalStore(subscribeReceipts, readReceipts, () => noReceipts);

  function show(next: KeyPairDialog) {
    dialogRef.current = next;
    setDialog(next);
  }

  function apply(attempt: CreateAttempt, transition: CreateTransition) {
    const store = browserReceiptStore();
    if (transition.effect === "forget") store.delete(attempt.idempotencyKey);
    show(transition.dialog);
    publishReceipts();
    if (transition.published) options.onCreated(transition.published);
  }

  async function run(attempt: CreateAttempt) {
    show({ step: "saving", attempt });
    gate.current = false;
    const result = await createKeyPairAction(attempt);
    const transition = finishCreate(attempt, result);
    apply(attempt, transition);
    if (result.status === "ready" && result.issued.privateKey && downloadPrivateKey(result.issued.privateKey)) {
      const store = browserReceiptStore();
      store.delete(attempt.idempotencyKey);
      publishReceipts();
    }
  }

  function submit() {
    const current = dialogRef.current;
    if (gate.current || !acceptsNewAttempt(current) || current.step !== "form") return;
    gate.current = true;
    const parsed = parseDraft({
      mode: current.mode,
      name: current.name,
      keyType: current.keyType,
      keyFormat: current.keyFormat,
      publicKey: current.publicKey,
    });
    if (!parsed.ok) {
      gate.current = false;
      show({ ...current, error: parsed.error });
      return;
    }
    try {
      void run(commitAttempt(browserReceiptStore(), parsed.value));
      publishReceipts();
    } catch {
      gate.current = false;
      show({
        ...current,
        error: {
          code: "BrowserStorage",
          message: "The browser could not store the key pair request.",
          requestId: null,
        },
      });
    }
  }

  function openGenerate() {
    show({ step: "form", mode: "generate", ...emptyForm });
  }

  function openImport() {
    show({ step: "form", mode: "import", ...emptyForm });
  }

  function close() {
    const current = dialogRef.current;
    if (current.step === "download") {
      apply(current.attempt, acknowledgeDownload(current.attempt));
      return;
    }
    if (current.step === "form" || current.step === "saving" || current.step === "error") show({ step: "closed" });
  }

  function patch(partial: { name?: string; keyType?: KeyType; keyFormat?: KeyFormat; publicKey?: string }) {
    const current = dialogRef.current;
    if (current.step !== "form") return;
    show({ ...current, ...partial, error: null });
  }

  const form = dialog.step === "form" ? dialog : null;
  const download = dialog.step === "download" ? dialog : null;
  const failure = dialog.step === "error" ? dialog : null;

  const portal = (
    <>
      {dialog.step === "closed" && receipts.length > 0 ? (
        <div
          role="status"
          className="mx-4 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e6e8eb] bg-[#f7f8f8] px-3 py-2 text-[13px]"
        >
          <p>
            {receipts.length === 1
              ? "A key pair create did not finish. Resume sends the same request."
              : `${receipts.length} key pair creates did not finish. Resume sends the next request.`}
          </p>
          <OutlineButton
            onClick={() => {
              if (dialogRef.current.step !== "closed") return;
              const [next] = browserReceiptStore().list();
              if (next) void run(next);
            }}
          >
            Resume
          </OutlineButton>
        </div>
      ) : null}
      <PanelDialog
        open={form !== null}
        title={form?.mode === "import" ? "Import key pair" : "Create key pair"}
        onClose={close}
        footer={
          <>
            <OutlineButton onClick={close}>Cancel</OutlineButton>
            <OrangeButton onClick={submit}>
              {form?.mode === "import" ? "Import key pair" : "Create key pair"}
            </OrangeButton>
          </>
        }
      >
        {form ? (
          <div className="space-y-3">
            <div>
              <FieldLabel>Key pair name</FieldLabel>
              <input className="field" value={form.name} onChange={(event) => patch({ name: event.target.value })} />
            </div>
            {form.mode === "generate" ? (
              <>
                <ChoiceGroup
                  legend="Key pair type"
                  name="key-pair-type"
                  value={form.keyType}
                  options={KEY_TYPE_OPTIONS}
                  onChange={(keyType) => patch({ keyType })}
                />
                <ChoiceGroup
                  legend="Private key file format"
                  name="key-pair-format"
                  value={form.keyFormat}
                  options={KEY_FORMAT_OPTIONS}
                  onChange={(keyFormat) => patch({ keyFormat })}
                />
              </>
            ) : (
              <div>
                <FieldLabel>Public key</FieldLabel>
                <textarea
                  className="w-full rounded-lg border border-[#aab7b8] px-2.5 py-2 text-[13px]"
                  rows={5}
                  value={form.publicKey}
                  onChange={(event) => patch({ publicKey: event.target.value })}
                />
              </div>
            )}
            {form.error ? (
              <p role="alert" className="text-[#d91515]">
                {form.error.message}
              </p>
            ) : null}
          </div>
        ) : null}
      </PanelDialog>
      <PanelDialog open={dialog.step === "saving"} title="Create key pair" onClose={close}>
        <p>Creating the key pair.</p>
      </PanelDialog>
      <PanelDialog
        open={download !== null}
        title="Download private key"
        onClose={close}
        footer={
          <>
            <OutlineButton onClick={close}>Close</OutlineButton>
            <OrangeButton
              onClick={() => {
                if (dialogRef.current.step !== "download") return;
                const current = dialogRef.current;
                if (!downloadPrivateKey(current.file)) return;
                const store = browserReceiptStore();
                store.delete(current.attempt.idempotencyKey);
                publishReceipts();
              }}
            >
              Download
            </OrangeButton>
          </>
        }
      >
        {download ? (
          <div className="space-y-2">
            <p>The file will not be shown again after the dialog closes.</p>
            {download.settlement === "still-running" ? (
              <p>The key pair is already stored and the operation is still finishing.</p>
            ) : null}
            {download.error ? (
              <p role="alert" className="text-[#d91515]">
                {download.error.message}
              </p>
            ) : null}
            <p className="font-mono text-[12px]">{download.file.fileName}</p>
          </div>
        ) : null}
      </PanelDialog>
      <PanelDialog
        open={failure !== null}
        title="Create key pair"
        onClose={close}
        footer={
          <>
            <OutlineButton
              onClick={() => {
                if (dialogRef.current.step !== "error") return;
                apply(dialogRef.current.attempt, discardAttempt(dialogRef.current.attempt));
              }}
            >
              Discard
            </OutlineButton>
            <OrangeButton
              onClick={() => {
                if (dialogRef.current.step !== "error") return;
                void run(dialogRef.current.attempt);
              }}
            >
              Retry
            </OrangeButton>
          </>
        }
      >
        {failure ? <p role="alert">{failure.error.message}</p> : null}
      </PanelDialog>
    </>
  );

  return { openGenerate, openImport, portal };
}

function ChoiceGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: readonly { value: T; label: string; description: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-[13px] font-semibold">{legend}</legend>
      <div className="space-y-2">
        {options.map((option) => (
          <label key={option.value} className="flex items-start gap-2">
            <input
              type="radio"
              name={name}
              className="mt-1"
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>
              <span className="block font-semibold">{option.label}</span>
              <span className="block text-[#5f6b7a]">{option.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
