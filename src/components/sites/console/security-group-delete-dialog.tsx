"use client";

import { deleteSecurityGroupsAction } from "@/app/actions/resources";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { OrangeButton, OutlineButton, PanelDialog } from "@/components/sites/console/ui";
import type { SecurityGroup } from "@/types/console";

export const IN_USE_UNKNOWN =
  "The VWS API does not report which instances use a security group, so the console cannot check that first.";

/** The confirmation for Delete security groups, shared by the list and the detail page. */
export function SecurityGroupDeleteDialog({
  groups,
  open,
  onClose,
  onDeleted,
}: {
  groups: SecurityGroup[];
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const action = useApiAction();
  const close = () => {
    if (action.pending) return;
    action.clear();
    onClose();
  };
  return (
    <PanelDialog
      open={open}
      title="Delete security groups"
      onClose={close}
      footer={
        <>
          <OutlineButton disabled={action.pending} onClick={close}>
            Cancel
          </OutlineButton>
          <OrangeButton
            disabled={action.pending || groups.length === 0}
            onClick={() =>
              action.run(
                () => deleteSecurityGroupsAction(groups.map((group) => group.id)),
                () => {
                  onDeleted();
                  onClose();
                },
              )
            }
          >
            {action.pending ? "Deleting…" : "Delete"}
          </OrangeButton>
        </>
      }
    >
      <p>Delete the following security groups? You cannot undo this.</p>
      <ul className="mt-2 list-disc pl-5">
        {groups.map((group) => (
          <li key={group.id}>
            <span className="font-mono">{group.id}</span> - {group.groupName}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-[#5f6b7a]">{IN_USE_UNKNOWN}</p>
      <div className="-mx-4">
        <ApiErrorAlert error={action.error} title="The security groups could not be deleted" />
      </div>
    </PanelDialog>
  );
}
