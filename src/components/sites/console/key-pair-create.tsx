"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createKeyPairAction } from "@/app/actions/resources";
import { CreatePage, Field, FormCard, optional, primaryPill } from "@/components/sites/console/ebs-form-parts";
import { Shell } from "@/components/sites/console/shell";
import { FieldLabel, OrangeButton, OutlineButton, PanelDialog } from "@/components/sites/console/ui";
import { computeNav } from "@/lib/console-data";
import {
  KEY_FORMAT_OPTIONS,
  KEY_TYPE_OPTIONS,
  acknowledgeDownload,
  acceptsNewAttempt,
  browserReceiptStore,
  commitAttempt,
  createFailureMessage,
  discardAttempt,
  downloadPrivateKey,
  finishCreate,
  forgetPendingName,
  parseDraft,
  publicKeyError,
  readPendingNames,
  type CreateAttempt,
  type CreateTransition,
  type KeyFormat,
  type KeyPairDialog,
  type KeyType,
  type StoredKeyPair,
} from "@/lib/key-pair";

type CreateMode = "generate" | "import";
type KeyPairForm = Extract<KeyPairDialog, { step: "form" }>;
type FormPatch = { name?: string; keyType?: KeyType; keyFormat?: KeyFormat; publicKey?: string };

const KEY_PAIRS_HREF = "/network/key-pairs";
const NAME_HINT = "The name can include up to 255 ASCII characters. It can't include leading or trailing spaces.";

function emptyForm(mode: CreateMode): KeyPairForm {
  return {
    step: "form",
    mode,
    name: "",
    keyType: KEY_TYPE_OPTIONS[0].value,
    keyFormat: KEY_FORMAT_OPTIONS[0].value,
    publicKey: "",
    error: null,
  };
}

const noNames: string[] = [];
let nameSnapshot: readonly string[] = noNames;
const nameListeners = new Set<() => void>();

function readNameSnapshot(): readonly string[] {
  const next = readPendingNames();
  const unchanged = next.length === nameSnapshot.length && next.every((name, index) => name === nameSnapshot[index]);
  if (unchanged) return nameSnapshot;
  nameSnapshot = next;
  return nameSnapshot;
}

function subscribeNames(listener: () => void) {
  nameListeners.add(listener);
  return () => nameListeners.delete(listener);
}

function publishNames() {
  for (const listener of nameListeners) listener();
}

const UNREACHABLE = {
  code: "Unavailable",
  message: "The key pair request did not reach the server. Retry from this dialog, or discard it.",
  requestId: null,
};

/**
 * One create or import, from the form through the private key download. `onClosed` runs each time the flow returns
 * to closed: a cancel, a discard, or the end of a download.
 */
function useKeyPairFlow(options: {
  initial: KeyPairDialog;
  onCreated: (keyPair: StoredKeyPair) => void;
  onClosed?: () => void;
}) {
  const dialogRef = useRef<KeyPairDialog>(options.initial);
  const [lastForm, setLastForm] = useState<KeyPairForm>(
    options.initial.step === "form" ? options.initial : emptyForm("generate"),
  );
  const gate = useRef(false);
  const [dialog, setDialog] = useState<KeyPairDialog>(options.initial);

  function show(next: KeyPairDialog) {
    dialogRef.current = next;
    if (next.step === "form") setLastForm(next);
    setDialog(next);
    if (next.step === "closed") options.onClosed?.();
  }

  function apply(transition: CreateTransition) {
    show(transition.dialog);
    publishNames();
    if (transition.published) options.onCreated(transition.published);
  }

  function clearDownloaded(name: string) {
    forgetPendingName(name);
    publishNames();
  }

  async function run(attempt: CreateAttempt) {
    show({ step: "saving", attempt });
    gate.current = false;
    let result: Awaited<ReturnType<typeof createKeyPairAction>>;
    try {
      result = await createKeyPairAction(attempt);
    } catch {
      show({ step: "error", attempt, error: UNREACHABLE });
      publishNames();
      return;
    }
    const transition = finishCreate(attempt, result);
    apply(transition);
    if (result.status === "ready" && result.issued.privateKey && downloadPrivateKey(result.issued.privateKey)) {
      clearDownloaded(result.issued.keyPair.name);
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
      publishNames();
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

  function close() {
    const current = dialogRef.current;
    if (current.step === "download") {
      apply(acknowledgeDownload(current.attempt));
      return;
    }
    if (current.step === "form" || current.step === "saving" || current.step === "error") show({ step: "closed" });
  }

  function patch(partial: FormPatch) {
    const current = dialogRef.current;
    if (current.step !== "form") return;
    show({ ...current, ...partial, error: null });
  }

  function choosePublicKeyFile(text: string) {
    const current = dialogRef.current;
    if (current.step !== "form") return;
    const error = publicKeyError(text);
    show(error ? { ...current, publicKey: "", error } : { ...current, publicKey: text, error: null });
  }

  const download = dialog.step === "download" ? dialog : null;
  const failure = dialog.step === "error" ? dialog : null;

  const outcomeDialogs = (
    <>
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
                clearDownloaded(current.keyPair.name);
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
                apply(discardAttempt(dialogRef.current.attempt));
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
        {failure ? <p role="alert">{createFailureMessage(failure.attempt, failure.error)}</p> : null}
      </PanelDialog>
    </>
  );

  return { dialog, lastForm, show, submit, close, patch, choosePublicKeyFile, outcomeDialogs };
}

/** Says which private keys can no longer be shown and which creates never finished, until the user dismisses it. */
export function KeyPairRecoveryNotice({ knownNames }: { knownNames: readonly string[] }) {
  const pendingNames = useSyncExternalStore(subscribeNames, readNameSnapshot, () => noNames);
  const lostNames = pendingNames.filter((name) => knownNames.includes(name));
  const unfinishedNames = pendingNames.filter((name) => !knownNames.includes(name));
  if (pendingNames.length === 0) return null;
  return (
    <div
      role="status"
      className="mx-4 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e6e8eb] bg-[#f7f8f8] px-3 py-2 text-[13px]"
    >
      <div>
        {lostNames.map((name) => (
          <p key={name}>The private key for {name} cannot be shown again.</p>
        ))}
        {unfinishedNames.map((name) => (
          <p key={name}>The create for {name} did not finish. Create the key pair again if you still need it.</p>
        ))}
      </div>
      <OutlineButton
        onClick={() => {
          for (const name of pendingNames) forgetPendingName(name);
          publishNames();
        }}
      >
        Dismiss
      </OutlineButton>
    </div>
  );
}

/** The launch wizard's Create new key pair: the form in a dialog over the page. */
export function useKeyPairCreator(options: {
  onCreated: (keyPair: StoredKeyPair) => void;
  knownNames: readonly string[];
}): {
  openGenerate: () => void;
  openImport: () => void;
  portal: ReactNode;
} {
  const flow = useKeyPairFlow({ initial: { step: "closed" }, onCreated: options.onCreated });
  const form = flow.dialog.step === "form" ? flow.dialog : null;

  const portal = (
    <>
      {flow.dialog.step === "closed" ? <KeyPairRecoveryNotice knownNames={options.knownNames} /> : null}
      <PanelDialog
        open={form !== null}
        title={form?.mode === "import" ? "Import key pair" : "Create key pair"}
        onClose={flow.close}
        footer={
          <>
            <OutlineButton onClick={flow.close}>Cancel</OutlineButton>
            <OrangeButton onClick={flow.submit}>
              {form?.mode === "import" ? "Import key pair" : "Create key pair"}
            </OrangeButton>
          </>
        }
      >
        {form ? (
          <KeyPairFields
            form={form}
            nameLabel="Key pair name"
            disabled={false}
            onPatch={flow.patch}
            onPublicKeyFile={flow.choosePublicKeyFile}
          />
        ) : null}
      </PanelDialog>
      {flow.outcomeDialogs}
    </>
  );

  return {
    openGenerate: () => flow.show(emptyForm("generate")),
    openImport: () => flow.show(emptyForm("import")),
    portal,
  };
}

/** The Create key pair and Import key pair pages. Every way out of the flow returns to the Key pairs list. */
export function KeyPairCreateView({ mode }: { mode: CreateMode }) {
  const router = useRouter();
  const left = useRef(false);
  const flow = useKeyPairFlow({
    initial: emptyForm(mode),
    onCreated: () => {},
    onClosed: () => {
      // A create keeps running after its saving dialog is closed, and must not pull the user back when it settles.
      if (left.current) return;
      left.current = true;
      router.push(KEY_PAIRS_HREF);
    },
  });
  const editing = flow.dialog.step === "form";
  const title = mode === "import" ? "Import key pair" : "Create key pair";

  return (
    <Shell tree={computeNav}>
      <CreatePage
        crumbs={[
          { label: "EC2", href: "/compute/instances" },
          { label: "Key pairs", href: KEY_PAIRS_HREF },
          { label: title },
        ]}
        title={title}
        info={
          mode === "import"
            ? "Import the public key of a key pair you created with a third-party tool. VWS stores only the public key."
            : "VWS stores the public key. The private key file downloads to your computer once, when the key pair is created."
        }
      >
        <FormCard title="Key pair">
          <p className="-mt-4">
            A key pair, consisting of a private key and a public key, is a set of security credentials that you use to
            prove your identity when connecting to an instance.
          </p>
          <div className="max-w-[1045px]">
            <KeyPairFields
              form={flow.lastForm}
              nameLabel="Name"
              disabled={!editing}
              onPatch={flow.patch}
              onPublicKeyFile={flow.choosePublicKeyFile}
            />
          </div>
          <div>
            <p className="text-[14px]">{optional("Tags")}</p>
            <p className="mt-1 text-[#5f6b7a]">No tags associated with the resource.</p>
            <button
              type="button"
              disabled
              title="console-api does not store tags on key pairs yet."
              className="mt-3 inline-flex h-8 items-center rounded-full border-2 border-[#9ba7b6] px-5 text-[14px] font-bold text-[#9ba7b6]"
            >
              Add new tag
            </button>
            <p className="mt-1 text-[12px] text-[#5f6b7a]">You can add up to 50 more tags.</p>
          </div>
        </FormCard>
        <div className="flex items-center justify-end gap-6">
          <button type="button" className="text-[14px] font-bold text-[#006ce0] hover:underline" onClick={flow.close}>
            Cancel
          </button>
          <OrangeButton className={primaryPill} disabled={!editing} onClick={flow.submit}>
            {title}
          </OrangeButton>
        </div>
      </CreatePage>
      {flow.outcomeDialogs}
    </Shell>
  );
}

function KeyPairFields({
  form,
  nameLabel,
  disabled,
  onPatch,
  onPublicKeyFile,
}: {
  form: KeyPairForm;
  nameLabel: string;
  disabled: boolean;
  onPatch: (partial: FormPatch) => void;
  onPublicKeyFile: (text: string) => void;
}) {
  return (
    <div className="space-y-4">
      <Field label={nameLabel} htmlFor="key-pair-name" hint={NAME_HINT}>
        <input
          id="key-pair-name"
          className="field w-full"
          placeholder="Enter key pair name"
          value={form.name}
          disabled={disabled}
          onChange={(event) => onPatch({ name: event.target.value })}
        />
      </Field>
      {form.mode === "generate" ? (
        <>
          <fieldset disabled={disabled}>
            <legend className="mb-1 text-[14px] font-bold">Key pair type</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {KEY_TYPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex h-10 items-center gap-2 rounded-lg border-2 px-3 ${
                    form.keyType === option.value ? "border-[#006ce0] bg-[#f0fbff]" : "border-[#8c8c94]"
                  }`}
                >
                  <input
                    type="radio"
                    name="key-pair-type"
                    checked={form.keyType === option.value}
                    onChange={() => onPatch({ keyType: option.value })}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={disabled}>
            <legend className="mb-1 text-[14px] font-bold">Private key file format</legend>
            <div className="space-y-2">
              {KEY_FORMAT_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="key-pair-format"
                    className="mt-1"
                    checked={form.keyFormat === option.value}
                    onChange={() => onPatch({ keyFormat: option.value })}
                  />
                  <span>
                    <span className="block">{option.label}</span>
                    <span className="block text-[12px] text-[#5f6b7a]">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </>
      ) : (
        <div>
          <FieldLabel>Public key contents</FieldLabel>
          <div className="mb-2">
            <label className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-[#aab7b8] bg-white px-3 text-[13px] font-semibold">
              Browse
              <input
                aria-label="Browse"
                type="file"
                className="sr-only"
                disabled={disabled}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void file.text().then(onPublicKeyFile);
                }}
              />
            </label>
          </div>
          <textarea
            aria-label="Public key contents"
            className="w-full rounded-lg border border-[#aab7b8] px-2.5 py-2 text-[13px]"
            rows={5}
            value={form.publicKey}
            disabled={disabled}
            onChange={(event) => onPatch({ publicKey: event.target.value })}
          />
        </div>
      )}
      {form.error ? (
        <p role="alert" className="text-[#d91515]">
          {form.error.message}
        </p>
      ) : null}
    </div>
  );
}
