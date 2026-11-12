import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { NextConfig } from "next";
import { relayUpgrade } from "./console-relay.mts";

Object.assign(process.env, { NODE_ENV: "production" });
const { values } = parseArgs({
  options: { port: { type: "string", short: "p" }, hostname: { type: "string", short: "H" } },
});
const port = Number(values.port ?? process.env.PORT ?? 3000);
const hostname = values.hostname ?? process.env.HOSTNAME ?? "0.0.0.0";
const dir = resolve(import.meta.dirname, "..");
process.chdir(dir);
const { config } = JSON.parse(readFileSync(resolve(dir, ".next/required-server-files.json"), "utf8")) as {
  config: NextConfig;
};
process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config);

// Next's custom-server wrapper adds its own upgrade listener on the first HTTP request.
// Use the same initializer as its generated server so only our listener owns upgraded sockets.
const { getRequestHandlers } = await import("next/dist/server/lib/start-server.js");
const { requestHandler } = await getRequestHandlers({
  dir,
  port,
  hostname,
  isDev: false,
  onDevServerCleanup: undefined,
});
const server = createServer((request, response) => {
  void requestHandler(request, response).catch((error: unknown) => {
    // eslint-disable-next-line no-console -- fixed diagnostics keep request values out of error messages
    console.error(
      JSON.stringify({
        level: "error",
        service: "vws-console",
        event: "server.request_error",
        name: error instanceof TypeError ? "TypeError" : "Error",
        message: "Request handler failed",
      }),
    );
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});
const sockets = new Set<Socket>();
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.once("close", () => sockets.delete(socket));
});
let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  // eslint-disable-next-line no-console -- one fixed lifecycle event for both termination signals
  console.info(JSON.stringify({ level: "info", service: "vws-console", event: "server.shutdown" }));
  server.close();
  for (const socket of sockets) socket.destroy();
  // Leave room for instrumentation's two-second SIGTERM flush, then bound PID 1's exit.
  setTimeout(() => process.exit(0), 2500);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
server.on("upgrade", relayUpgrade);
server.listen(port, hostname, () => {
  // eslint-disable-next-line no-console -- bounded startup event for operators and process supervisors
  console.info(JSON.stringify({ level: "info", service: "vws-console", event: "server.listen", port }));
});
