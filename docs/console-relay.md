# Deploying the instance console relay

The browser connects to the console origin at
`/api/v1/instances/{id}/console?kind=vnc` or `?kind=serial`. The production Node
entry, `server/console-server.mts`, owns the HTTP upgrade and pipes the websocket
to console-api. It passes binary, text and control frames unchanged. All regular
HTTP requests still go through Next, including `/healthz`, `/readyz`, the UI and
the instrumentation that starts the separate `METRICS_PORT` listener.

## Production entry and standalone files

Use Node.js 24 or newer. Run `npm ci`, `npm run build`, then `npm start`.
`PORT` (default `3000`) and `HOSTNAME` (default `0.0.0.0`) control the listener.
`npm start -- -p 8080 -H 127.0.0.1` overrides them.

The Dockerfile runs `node server/console-server.mts`. Its runner contains:

- The contents of `.next/standalone`, including the traced dependencies and
  `.next/required-server-files.json`.
- `.next/static` at `.next/static`, and `public` at `public`.
- `server` at `server`.
- `src/lib/instance-id.ts` and `src/lib/vws-api/session-cookies.ts` at their
  original relative paths, shared with the application.

Next does not trace custom entries automatically. The Dockerfile explicitly
copies the entry and its local imports. The entry loads the build's serialized
configuration from `.next/required-server-files.json` into
`__NEXT_PRIVATE_STANDALONE_CONFIG`, as the generated standalone `server.js` does.
It calls the same Next router initializer used by that generated server. This
avoids the additional upgrade listener installed by Next's custom-server wrapper.
The generated `server.js` is not the entry to use for this deployment.

`npm run test:e2e:standalone` reproduces those Dockerfile copies inside the
worktree and runs Docker's CMD with Node. Playwright requires `/healthz` to return
200, then tests the relay through that listener. Docker is not required.

`npm run dev` continues to use `next dev`, including its HMR websocket. It does
not serve the instance relay; use the production build to test instance consoles.

## Upstream and session

Set `VWS_CONSOLE_API_URL` to the HTTP or HTTPS base URL of console-api, for example
`http://console-api:8080`. As with JSON API calls, trailing slashes are removed and
the API path is appended to the base. The relay forwards the instance path and
query. It never uses `VWS_CONSOLE_API_TOKEN`, even with IAM off: instance consoles
require a signed-in cookie session.

The browser's `vws_session` becomes the single upstream cookie
`__Host-vws_session`. Other cookies and Authorization are not forwarded. The
browser's single Origin header and websocket negotiation headers are forwarded.
**Console-api must list the console's public origin in its allowed origins**
(`-console-origins`; `originOK` in console-api's `limit.go`). Keep the public
scheme, host and port intact through any reverse proxy. The relay does not
replace Origin with the upstream origin.

Only an instance ID matching `^i-[0-9a-f]{8,17}$` and the canonical query
`kind=vnc` or `kind=serial` are accepted. Duplicate or extra query keys,
missing or multiple Origins, duplicate session cookies and session values above
4096 bytes are refused. No session returns 401 before an upstream connection.
Other upgrade routes return 404. The proxy does not follow redirects.

An ingress in front of the console must support HTTP/1.1 websocket upgrades and
forward the Cookie, Origin, Connection, Upgrade and Sec-WebSocket-* headers.
Terminate public TLS there, or supply HTTPS through the hosting infrastructure.
Keep console-api on a trusted private network when using HTTP upstream.

## Timeouts, closure and logs

`VWS_CONSOLE_API_TIMEOUT_MS` bounds the entire upstream handshake, including DNS
and connection establishment. It uses the JSON transport's positive-number
semantics and default of `10000` ms. A timeout returns 504. A network failure
returns 502. A console-api refusal preserves its HTTP status, with an empty body;
upstream error bodies and headers are not copied. Missing or invalid upstream
configuration returns 503. Handshakes are attempted once, without automatic
retries.

`VWS_CONSOLE_RELAY_IDLE_TIMEOUT_MS` sets the idle timeout after upgrade (default
`300000` ms). Either socket timing out destroys both sockets. Traffic on each
socket resets its idle timer. Closing or losing either peer closes the other;
the browser must explicitly reconnect after an outage. Each connection is
independent, and the relay keeps no session or console state.

Structured JSON logs use `service: "vws-console"` and events
`console.relay.open`, `console.relay.close` and `console.relay.refuse`. Each has
status and duration in milliseconds; failures have a fixed diagnostic code,
such as `UpstreamUnreachable` or `HandshakeTimeout`. No URL, query, cookie,
session value or upstream error message is logged.

The relay suite is part of `npm run test:e2e`. It uses a fake websocket upstream
and the built console, checks real browser binary and text frames, closure,
reconnects, invalid upgrades, refusal statuses, handshake and idle timeouts,
unreachable upstream logs, and both handshake head buffers.
