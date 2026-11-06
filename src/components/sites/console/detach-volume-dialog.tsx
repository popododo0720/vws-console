"use client";

import type { Volume } from "@/types/console";
import { detachVolumeAction } from "@/app/actions/resources";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { OrangeButton, OutlineButton, PanelDialog } from "@/components/sites/console/ui";

/** Mount it to open it: each open starts without the previous attempt's error. */
export function DetachVolumeDialog({ volume, onClose }: { volume: Volume; onClose: () => void }) {
  const action = useApiAction();
  return (
    <PanelDialog
      open
      title="Detach volume"
      onClose={onClose}
      footer={
        <>
          <OutlineButton onClick={onClose}>Cancel</OutlineButton>
          <OrangeButton
            disabled={action.pending}
            onClick={() => action.run(() => detachVolumeAction(volume.id), onClose)}
          >
            Detach
          </OrangeButton>
        </>
      }
    >
      <ApiErrorAlert error={action.error} title="The volume could not be detached" />
      <p>Are you sure that you want to detach the following volume?</p>
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
