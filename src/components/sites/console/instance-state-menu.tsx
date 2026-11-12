"use client";

import {
  rebootInstancesAction,
  startInstancesAction,
  stopInstancesAction,
  terminateInstancesAction,
} from "@/app/actions/resources";
import type { useApiAction } from "@/components/sites/console/api-action";
import { MenuButton, blueMenuTriggerClass } from "@/components/sites/console/ui";
import type { ApiError } from "@/lib/vws-api/adapter";
import type { Instance, InstanceState } from "@/types/console";

type Change = {
  label: string;
  action: string;
  /** The states console-api takes the change from. An instance in another state is left out of the request. */
  from: readonly InstanceState[];
  send: (ids: string[]) => Promise<ApiError | null>;
  running: string;
  done: string;
};

const TERMINATE = "ec2:TerminateInstances";

/** The entries of the AWS console's Instance state menu, in its order. console-api has no hibernate action. */
const changes: Change[] = [
  {
    label: "Stop instance",
    action: "ec2:StopInstances",
    from: ["running"],
    send: stopInstancesAction,
    running: "Stopping",
    done: "stopped",
  },
  {
    label: "Start instance",
    action: "ec2:StartInstances",
    from: ["stopped"],
    send: startInstancesAction,
    running: "Starting",
    done: "started",
  },
  {
    label: "Reboot instance",
    action: "ec2:RebootInstances",
    from: ["running"],
    send: rebootInstancesAction,
    running: "Rebooting",
    done: "rebooted",
  },
  {
    label: "Terminate (delete) instance",
    action: TERMINATE,
    from: ["pending", "running", "stopping", "stopped", "shutting-down"],
    send: terminateInstancesAction,
    running: "Terminating",
    done: "terminated",
  },
];

export function InstanceStateMenu({
  instances,
  action,
  onTerminated,
}: {
  instances: Instance[];
  action: ReturnType<typeof useApiAction>;
  onTerminated?: () => void;
}) {
  return (
    <MenuButton
      className={blueMenuTriggerClass()}
      label={
        <>
          Instance state{" "}
          <span aria-hidden className="text-[9px]">
            ▼
          </span>
        </>
      }
      items={changes.map((change) => {
        const ids = instances.filter((item) => change.from.includes(item.state)).map((item) => item.id);
        const names = ids.join(", ");
        return {
          label: change.label,
          action: change.action,
          disabled: action.pending || ids.length === 0,
          onSelect: () =>
            action.run(() => change.send(ids), change.action === TERMINATE ? onTerminated : undefined, {
              running: `${change.running} ${names}…`,
              succeeded: `Successfully ${change.done} ${names}`,
            }),
        };
      })}
    />
  );
}
