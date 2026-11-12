import { isInstanceId } from "@/lib/vws-api/adapter";
import { route, withQuery } from "@/lib/vws-api/route";

export type ConsoleKind = "vnc" | "serial";

/** The capability action that says whether a region opens instance consoles. */
export const OPEN_CONSOLE = "vws:OpenConsole";

export const connectHref = (id: string) => `/compute/instances/${encodeURIComponent(id)}/connect`;

/**
 * The websocket of one console of an instance: console-api's path on the console's own origin, so the URL holds no
 * credential. Null for an ID that breaks the instance ID rule, which therefore never reaches a URL. console-api
 * refuses any query but the one `kind`.
 */
export function consoleSocketUrl(
  origin: Pick<Location, "protocol" | "host">,
  id: string,
  kind: ConsoleKind,
): string | null {
  if (!isInstanceId(id)) return null;
  const scheme = origin.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${origin.host}/api/v1${withQuery(route("/instances/{id}/console", { id }), { kind }).path}`;
}

/** How long a console may take from opening its websocket to being usable. */
export const CONNECT_TIMEOUT_MS = 15_000;

export type ConsoleSocket = {
  socket: WebSocket;
  /** The console is usable, so the connect timeout no longer applies. */
  connected: () => void;
  /** Ends the session with the reason the page shows. Only the first end counts. */
  end: (reason: string) => void;
  /** The page is done with the session: closes the socket and reports nothing more. */
  dispose: () => void;
};

function closeReason({ code, reason }: CloseEvent): string {
  return reason
    ? `The console closed the connection: ${reason} (code ${code}).`
    : `The console connection was closed (code ${code}).`;
}

/**
 * Opens the websocket of a console and ends the session once, with a reason, on an error, a close or a connect that
 * takes too long. Nothing here reconnects: opening a console is the user's action.
 */
export function openConsoleSocket(
  url: string,
  on: { connected: () => void; ended: (reason: string) => void },
): ConsoleSocket {
  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";
  let over = false;
  const finish = (report: () => void) => {
    if (over) return;
    over = true;
    clearTimeout(timer);
    socket.close();
    report();
  };
  const end = (reason: string) => finish(() => on.ended(reason));
  const timer = setTimeout(
    () => end(`The console did not answer within ${CONNECT_TIMEOUT_MS / 1000} seconds.`),
    CONNECT_TIMEOUT_MS,
  );
  socket.addEventListener("error", () => end("The connection to the console failed."));
  socket.addEventListener("close", (event) => end(closeReason(event)));
  return {
    socket,
    connected: () => {
      if (over) return;
      clearTimeout(timer);
      on.connected();
    },
    end,
    dispose: () => finish(() => undefined),
  };
}
