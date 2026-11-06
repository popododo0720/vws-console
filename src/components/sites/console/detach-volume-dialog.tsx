"use client";

import type { Volume } from "@/types/console";
import { detachVolumeAction } from "@/app/actions/resources";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { OrangeButton, OutlineButton, PanelDialog } from "@/components/sites/console/ui";

export type DetachMode = "detach" | "force";

const COPY: Record<DetachMode, { title: string; question: string; confirm: string; failed: string }> = {
  detach: {
    title: "Detach volume",
    question: "Are you sure that you want to detach the following volume?",
    confirm: "Detach",
    failed: "The volume could not be detached",
  },
  force: {
    title: "Force detach volume",
    question: "Are you sure that you want to force detach the following volume?",
    confirm: "Force detach",
    failed: "The volume could not be force detached",
  },
};

/** Mount it to open it: each open starts without the previous attempt's error. */
export function DetachVolumeDialog({
  volume,
  mode,
  onClose,
}: {
  volume: Volume;
  mode: DetachMode;
  onClose: () => void;
}) {
  const action = useApiAction();
  const copy = COPY[mode];
  return (
    <PanelDialog
      open
      title={copy.title}
      onClose={onClose}
      footer={
        <>
          <OutlineButton onClick={onClose}>Cancel</OutlineButton>
          <OrangeButton
            disabled={action.pending}
            onClick={() => action.run(() => detachVolumeAction(volume.id, mode === "force"), onClose)}
          >
            {copy.confirm}
          </OrangeButton>
        </>
      }
    >
      <ApiErrorAlert error={action.error} title={copy.failed} />
      {mode === "force" ? (
        <div className="mb-3 rounded-lg border border-[#8d6605] bg-[#fffce9] px-3 py-2">
          <p className="font-semibold">Force detaching a volume can lead to data loss or a corrupted file system.</p>
          <p className="mt-1">
            Use this option only as a last resort to detach a volume from a failed instance, or if you are detaching a
            volume with the intention of deleting it. The instance doesn&apos;t get an opportunity to flush file system
            caches or file system metadata. If you use this option, you must perform file system check and repair
            procedures.
          </p>
        </div>
      ) : null}
      <p>{copy.question}</p>
      <p className="mt-2 font-mono text-[12px]">{volume.name ? `${volume.id} (${volume.name})` : volume.id}</p>
      {volume.attachment ? (
        <p className="mt-1">
          from instance {volume.attachment.instanceId}
          {volume.attachment.device ? ` (${volume.attachment.device})` : ""}
        </p>
      ) : null}
    </PanelDialog>
  );
}
