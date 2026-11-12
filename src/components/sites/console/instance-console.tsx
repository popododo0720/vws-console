"use client";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { reportClientError } from "@/lib/client-error";
import { consoleSocketUrl, openConsoleSocket, type ConsoleKind, type ConsoleSocket } from "@/lib/instance-console";
import { cn } from "@/lib/utils";

export type ConsoleState =
  { phase: "idle" } | { phase: "connecting" } | { phase: "connected" } | { phase: "disconnected"; reason: string };

/** Puts one console into `host` on the session's socket; the returned function takes it out again. */
type Attach = (host: HTMLElement, session: ConsoleSocket) => () => void;

/**
 * Both clients need the DOM and only this page uses them, so each is loaded in the browser when a session starts.
 * A client is attached in the same task that opens the socket, so it sees the first message.
 */
const clients: Record<ConsoleKind, () => Promise<Attach>> = {
  vnc: async () => {
    const { default: RFB } = await import("@novnc/novnc");
    return (host, session) => {
      const rfb = new RFB(host, session.socket);
      let live = true;
      rfb.scaleViewport = true;
      rfb.background = getComputedStyle(host).backgroundColor;
      rfb.addEventListener("connect", () => {
        session.connected();
        rfb.focus();
      });
      rfb.addEventListener("credentialsrequired", () =>
        session.end("The VNC server asked for a password, which the console does not send."),
      );
      rfb.addEventListener("securityfailure", ({ detail }) =>
        session.end(`The VNC server refused the connection${detail.reason ? `: ${detail.reason}` : "."}`),
      );
      rfb.addEventListener("disconnect", () => {
        live = false;
        session.end("The VNC session ended unexpectedly.");
      });
      return () => {
        if (live) rfb.disconnect();
      };
    };
  },
  serial: async () => {
    const { Terminal } = await import("@xterm/xterm");
    return (host, { socket, connected }) => {
      const style = getComputedStyle(host);
      const terminal = new Terminal({
        cols: 80,
        rows: 24,
        cursorBlink: true,
        fontFamily: style.fontFamily,
        fontSize: parseFloat(style.fontSize),
        theme: { background: style.backgroundColor, foreground: style.color },
      });
      terminal.open(host);
      const encoder = new TextEncoder();
      terminal.onData((keys) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(encoder.encode(keys));
      });
      socket.addEventListener("open", () => {
        connected();
        terminal.focus();
      });
      socket.addEventListener("message", ({ data }: MessageEvent<ArrayBuffer | string>) =>
        terminal.write(typeof data === "string" ? data : new Uint8Array(data)),
      );
      return () => terminal.dispose();
    };
  },
};

/** The VNC screen scales into a fixed box. The serial terminal is 80 by 24 at any width, so its box grows to it. */
const frames: Record<ConsoleKind, string> = {
  vnc: "h-60 sm:h-[440px]",
  serial: "min-h-60 p-2 sm:min-h-[440px]",
};

/**
 * The screen of one console. While `active` it holds a session of its own: mounting opens a websocket and unmounting
 * closes it, so a new `key` is a fresh session. `label` is shown over the screen while there is nothing on it.
 */
export function InstanceConsole({
  id,
  kind,
  active,
  label,
  onState,
}: {
  id: string;
  kind: ConsoleKind;
  active: boolean;
  label: string | null;
  onState: (state: ConsoleState) => void;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = host.current;
    if (!active || !target) return;
    const context = `instance-connect-${kind}`;
    let gone = false;
    let session: ConsoleSocket | null = null;
    let detach = () => {};
    const ended = (reason: string) => {
      reportClientError({ code: "ConsoleDisconnected", message: reason }, context);
      onState({ phase: "disconnected", reason });
    };
    const start = async () => {
      const attach = await clients[kind]();
      if (gone) return;
      const url = consoleSocketUrl(window.location, id, kind);
      if (!url) return ended("The instance ID is not valid.");
      session = openConsoleSocket(url, { connected: () => onState({ phase: "connected" }), ended });
      detach = attach(target, session);
    };
    start().catch((error: unknown) => {
      reportClientError(error, context);
      session?.dispose();
      if (!gone) onState({ phase: "disconnected", reason: "The console could not be started in this browser." });
    });
    return () => {
      gone = true;
      detach();
      session?.dispose();
    };
  }, [id, kind, active, onState]);

  return (
    <div className="relative">
      <div
        ref={host}
        className={cn(
          "min-w-0 overflow-auto rounded-lg bg-[#0f141a] font-mono text-[13px] text-[#d5dbdb]",
          frames[kind],
        )}
      />
      {label ? (
        <p className="pointer-events-none absolute inset-0 grid place-items-center px-4 text-center text-[13px] text-[#d5dbdb]">
          {label}
        </p>
      ) : null}
    </div>
  );
}
