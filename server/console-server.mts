import { readFileSync } from "node:fs";
import { createServer } from "node:http";
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
  void requestHandler(request, response).catch(() => {
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});
server.on("upgrade", relayUpgrade);
server.listen(port, hostname, () => {
  // eslint-disable-next-line no-console -- bounded startup event for operators and process supervisors
  console.info(JSON.stringify({ level: "info", service: "vws-console", event: "server.listen", port }));
});
