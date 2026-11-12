"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ApiErrorAlert } from "@/components/sites/console/api-action";
import { useDenied } from "@/components/sites/console/console-provider";
import { CreatePage, Notice, primaryPill, secondaryPill } from "@/components/sites/console/ebs-form-parts";
import { InstanceConsole, type ConsoleState } from "@/components/sites/console/instance-console";
import { Shell } from "@/components/sites/console/shell";
import { ActionButton, DetailGrid, OrangeButton, OutlineButton } from "@/components/sites/console/ui";
import { computeNav } from "@/lib/console-data";
import { OPEN_CONSOLE, type ConsoleKind } from "@/lib/instance-console";
import { cn } from "@/lib/utils";
import type { ApiError } from "@/lib/vws-api/adapter";
import type { Instance } from "@/types/console";

/** `ended` is what the screen says after a session: noVNC takes its screen away, the terminal keeps its output. */
const consoles: readonly { kind: ConsoleKind; tab: string; idle: string; ended: string | null }[] = [
  {
    kind: "vnc",
    tab: "VNC console",
    idle: "Choose Connect to open the screen of this instance.",
    ended: "Disconnected",
  },
  {
    kind: "serial",
    tab: "Serial console",
    idle: "Choose Connect to open the first serial port of this instance.",
    ended: null,
  },
];

const phases: Record<ConsoleState["phase"], { label: string; dot: string }> = {
  idle: { label: "Not connected", dot: "bg-[#5f6b7a]" },
  connecting: { label: "Connecting…", dot: "bg-[#006ce0]" },
  connected: { label: "Connected", dot: "bg-[#037f0c]" },
  disconnected: { label: "Disconnected", dot: "bg-[#d13212]" },
};

export function InstanceConnectView({
  id,
  instance,
  loadError,
}: {
  id: string;
  instance: Instance | null;
  loadError: ApiError | null;
}) {
  const why = useDenied()(OPEN_CONSOLE);
  const tabsId = useId();
  const [current, setCurrent] = useState(consoles[0]);
  // Each attempt is one console session with its own websocket; 0 is before the first Connect on a tab.
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ConsoleState>({ phase: "idle" });
  const back = `/compute/instances/${encodeURIComponent(id)}`;
  const phase = phases[state.phase];
  const onScreen = { idle: current.idle, connecting: phase.label, connected: null, disconnected: current.ended };

  const connect = () => {
    setAttempt((count) => count + 1);
    setState({ phase: "connecting" });
  };
  const choose = (next: (typeof consoles)[number]) => {
    if (next === current) return;
    setCurrent(next);
    setAttempt(0);
    setState({ phase: "idle" });
  };

  return (
    <Shell tree={computeNav} navMode="overlay-only">
      <CreatePage
        crumbs={[
          { label: "EC2", href: "/compute/instances" },
          { label: "Instances", href: "/compute/instances" },
          { label: id, href: back },
          { label: "Connect to instance" },
        ]}
        title="Connect to instance"
        info="The VNC and serial consoles are opened through the VWS API, in the region of the instance."
        lead={`Connect to your instance ${instance?.name ? `${id} (${instance.name})` : id} using any of these options`}
      >
        <ApiErrorAlert error={loadError} title="The instance could not be loaded" />
        {!loadError && !instance ? (
          <Notice title="Instance not found">
            <p className="mt-1">{id} is not in this region.</p>
            <Link href="/compute/instances" className="mt-1 inline-block text-[#006ce0] hover:underline">
              Back to instances
            </Link>
          </Notice>
        ) : null}
        {instance ? (
          <>
            {why === null ? null : (
              <div role="alert" className="rounded-lg border border-[#006ce0] bg-[#f0fbff] px-3 py-2 text-[14px]">
                <p className="font-semibold">The VNC and serial consoles are not available</p>
                <p className="mt-1">{why}</p>
              </div>
            )}
            <section className="rounded-2xl border border-[#c6c6cd] bg-white text-[14px]">
              <div role="tablist" aria-label="Connection type" className="flex gap-6 border-b border-[#e6e8eb] px-5">
                {consoles.map((item) => (
                  <ActionButton
                    key={item.kind}
                    action={OPEN_CONSOLE}
                    role="tab"
                    id={`${tabsId}-${item.kind}`}
                    aria-selected={item === current}
                    aria-controls={`${tabsId}-panel`}
                    className={cn(
                      "-mb-px border-b-2 py-3 font-bold disabled:border-transparent disabled:text-[#8d9aa8]",
                      item === current
                        ? "border-[#006ce0] text-[#006ce0]"
                        : "border-transparent text-[#16191f] hover:text-[#006ce0]",
                    )}
                    onClick={() => choose(item)}
                  >
                    {item.tab}
                  </ActionButton>
                ))}
              </div>
              <div
                role="tabpanel"
                id={`${tabsId}-panel`}
                aria-labelledby={`${tabsId}-${current.kind}`}
                className="space-y-4 px-5 pb-5 pt-4"
              >
                <DetailGrid
                  items={[
                    ["Instance ID", instance.id],
                    [
                      "Connection state",
                      <span key="state" role="status" className="inline-flex items-center gap-1.5">
                        <span aria-hidden className={cn("size-2 rounded-full", phase.dot)} />
                        {phase.label}
                      </span>,
                    ],
                  ]}
                />
                {state.phase === "disconnected" ? (
                  <Notice title="The console connection ended">
                    <p className="mt-1">{state.reason}</p>
                    <OutlineButton className={cn(secondaryPill, "mt-2")} onClick={connect}>
                      Reconnect
                    </OutlineButton>
                  </Notice>
                ) : null}
                {why === null ? (
                  <InstanceConsole
                    key={`${current.kind}:${attempt}`}
                    id={instance.id}
                    kind={current.kind}
                    active={attempt > 0}
                    label={onScreen[state.phase]}
                    onState={setState}
                  />
                ) : null}
              </div>
            </section>
            <div className="flex items-center justify-end gap-6">
              <Link href={back} className="text-[14px] font-bold text-[#006ce0] hover:underline">
                Cancel
              </Link>
              <OrangeButton
                action={OPEN_CONSOLE}
                className={primaryPill}
                disabled={state.phase === "connecting" || state.phase === "connected"}
                onClick={connect}
              >
                Connect
              </OrangeButton>
            </div>
          </>
        ) : null}
      </CreatePage>
    </Shell>
  );
}
