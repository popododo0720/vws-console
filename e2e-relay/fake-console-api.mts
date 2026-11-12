import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { Duplex } from "node:stream";

let dials = 0;
type Seen = { path: string; cookie?: string; origin?: string; region?: string | string[] };
let seen: Seen[] = [];
const sockets = new Set<Duplex>();
const server = createServer((request, response) => {
  if (request.url === "/__reset") {
    dials = 0;
    seen = [];
  }
  if (request.url === "/__close") for (const socket of sockets) socket.destroy();
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ dials, seen, active: sockets.size }));
});
server.on("upgrade", (request, socket, head) => {
  dials++;
  seen.push({
    path: request.url ?? "",
    cookie: request.headers.cookie,
    origin: request.headers.origin,
    region: request.headers["x-vws-region"],
  });
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  socket.on("error", () => socket.destroy());
  if (request.url?.includes("i-00000003")) {
    socket.end(`HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n${request.headers.cookie}`);
    return;
  }
  if (request.url?.includes("i-00000004")) return;
  const accept = createHash("sha1")
    .update(`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  const handshake = Buffer.from(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  const banner = Buffer.from("RFB 003.008\n");
  const rfb = request.url?.endsWith("kind=vnc");
  // Coalescing the banner with the handshake exercises the upstream head buffer.
  socket.write(rfb ? Buffer.concat([handshake, Buffer.from([0x82, banner.length]), banner]) : handshake);
  let pending = Buffer.alloc(0);
  const receive = (data: Buffer) => {
    pending = Buffer.concat([pending, data]);
    while (pending.length >= 6) {
      const opcode = pending[0] & 0x0f;
      const length = pending[1] & 0x7f;
      if (!(pending[1] & 0x80) || length >= 126) return socket.destroy();
      if (pending.length < length + 6) return;
      const mask = pending.subarray(2, 6);
      const payload = Buffer.from(pending.subarray(6, 6 + length));
      for (let index = 0; index < payload.length; index++) payload[index] ^= mask[index % 4];
      pending = pending.subarray(6 + length);
      if (opcode === 8) {
        socket.end(Buffer.concat([Buffer.from([0x88, payload.length]), payload]));
        return;
      }
      socket.write(Buffer.concat([Buffer.from([0x80 | opcode, payload.length]), payload]));
    }
  };
  socket.on("data", receive);
  if (head.length) receive(head);
});
server.listen(Number(process.env.FAKE_API_PORT ?? 43322), "127.0.0.1");
