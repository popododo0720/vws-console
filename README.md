# VWS console

A local mock of a cloud operations console. It covers six screens: instances, the launch form, volumes, security groups, VPCs, and buckets. All records stay in the browser session. There are no cloud credentials and no calls to a cloud provider.

VWS console is an independent open-source project. It is not affiliated with, endorsed by, or sponsored by Amazon Web Services or any other cloud provider. Service names such as EC2, EBS, S3, and VPC appear only to describe the kind of resource a screen manages. All other product names and trademarks belong to their owners.

The on-screen product name is VWS. Service menus use the names from the reference console screens. The header mark is the VWS wordmark.

The app was scaffolded from the MIT-licensed [ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template). The clone workflow (map, observe, build, compare) is in `.agents/skills/clone-website/`. Reference screenshots are used locally only (`docs/design-references/console/`, gitignored) and are not committed to the repo.

## Run

```bash
npm install
npm run dev -- -p 43123 -H 0.0.0.0
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123). Node.js 22 or newer is enough. The template's Docker files still expect Node 24.

| Script                                                  | What it does                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`                                           | Dev server. Pass `-p <port>` and `-H <host>`; the default is port 3000 on localhost. |
| `npm run build` then `npm start -- -p 43123 -H 0.0.0.0` | Production build and server.                                                         |
| `npm run check`                                         | Lint, typecheck, and build. Run it before opening a PR.                              |

No environment variables are required, and no `.env` file is read by the app. `PORT` and `DEV_PORT` only change the host ports in `docker-compose.yml`.

Check it is up: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:43123/compute/instances` prints `200`. The root path `/` redirects (307) to the instances screen.

## Connect to console-api

The Instances, Volumes, VPCs and Subnets screens read and change resources through the vws-console-api JSON surface (`/api/v1`). Only the console server calls it. Whether users sign in (IAM on) is learned from console-api (see IAM mode below). With IAM off it uses the `VWS_CONSOLE_API_TOKEN` bearer and nobody signs in. With IAM on, users sign in at `/login`; the console server calls `POST /api/v1/auth/login`, keeps the returned `vws_session` and `vws_csrf` in its own httpOnly, SameSite=Lax cookies (Secure except plain HTTP on loopback), forwards them on every call and sends `X-CSRF-Token` on every write. Page scripts can read neither. A missing session or a 401 sends the browser to `/login`, and the account menu has Sign out (`POST /api/v1/auth/logout`). With IAM on the console sends no bearer token. console-api only accepts sign-in and cookie writes from an allowed browser Origin, which the console forwards, so start console-api with `-console-origins` set to the console's public origin (for example `-console-origins=https://console.vws.example`). Sign-in, sign-out and session lookups write one JSON log line each (`event`, `outcome`, `status`, `requestId`, `durationMs`, and console-api's error `code`); passwords, MFA codes, tokens, cookies and CSRF values are never logged. Each call sends an `X-Request-Id` that console-api echoes in error responses. The account menu shows the signed-in user and account ID from `GET /api/v1/auth/session`. Mutations send an `Idempotency-Key` and wait for the returned operation to finish.

| Variable                     | Meaning                                                                                                                                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VWS_CONSOLE_API_URL`        | Base URL of the console surface, for example `http://127.0.0.1:8080`                                                                                                                                                                    |
| `VWS_CONSOLE_IAM`            | Unset (default): detect the mode from console-api. `on` or `off`: force it. Any other value (`true`, `1`, …) is a configuration error: the console logs `config.invalid` once at start and answers 503 to every page until it is fixed. |
| `VWS_CONSOLE_API_TOKEN`      | Used only when the mode is off: the same value as console-api's `-console-token`. Never sent to the browser.                                                                                                                            |
| `VWS_CONSOLE_API_TIMEOUT_MS` | Optional per-attempt timeout for console-api calls, default `10000`. GETs are retried up to 3 times on timeouts, network errors and 429/5xx with jittered backoff; writes, sign-in and sign-out are sent once.                          |

Without it those screens show a `ConsoleNotConfigured` error. The other screens still use local data, and no sign-in is asked for.

### IAM mode

With `VWS_CONSOLE_IAM` unset, the console server asks console-api `GET /api/v1/auth/session` without credentials and caches the answer for 30 s:

| console-api answer                                 | Mode                          |
| -------------------------------------------------- | ----------------------------- |
| `200` `{"loginEnabled":false}` (`-iam static`)     | off: no sign-in, bearer token |
| `401` (`-iam fake` / `grpc`)                       | on: sign-in at `/login`       |
| `loginEnabled:true` in a session or login response | on                            |

Detection fails closed. On a timeout, a network error or an answer without `loginEnabled`, the console keeps the last mode console-api reported. If it has none yet, it answers 503 ("cannot reach console-api to learn whether sign-in is on") and logs `iam.mode_detect` with `IamModeUnknown`. It never falls back to the token. Set `VWS_CONSOLE_IAM` to skip detection.

`npx playwright test -c playwright.live.config.ts` starts console-api with its fake backend (`VWS_CONSOLE_API_DIR`, default `../vws-console-api`, needs Go) with `-iam=fake`, a generated root password and `-console-origins` for the test console, signs in through `/login` and runs the live tests against it. `npx playwright test -c playwright.live-iam-off.config.ts` runs the resource flows with IAM off (token, no sign-in).

## Health, readiness and metrics

The console is a VWS service: it is deployed to Kubernetes like the other `vws-*` components, so it serves the same probe and scrape endpoints (decision for #68). They answer without sign-in, are never cached, and never print configuration values, tokens or console-api responses. `/healthz` and `/readyz` are on the app port (`PORT`). `/metrics` is on its own port (`METRICS_PORT`), so a NetworkPolicy can admit only the scraper to it while the app port stays public.

| Endpoint                         | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /healthz`                   | Liveness. `200` `{"status":"ok"}` while the server answers; it checks no dependency, so a console-api outage does not restart the console.                                                                                                                                                                                                                                                                                                                                                                          |
| `GET /readyz`                    | Readiness. `200` when `VWS_CONSOLE_IAM` and `VWS_CONSOLE_API_URL` are valid and, if `VWS_CONSOLE_API_URL` is set, console-api answers one unauthenticated `GET /api/v1/auth/session` below 500 within 2 s. Otherwise `503` with `{"status":"unavailable","checks":[{"name","status","reason"}]}`.                                                                                                                                                                                                                   |
| `GET /metrics` on `METRICS_PORT` | Prometheus text. Every metric starts with `vws_console_`: `vws_console_http_requests_total{method}`, `vws_console_api_requests_total{method,route,status_class,outcome}`, `vws_console_api_request_duration_seconds{method,route}`, `vws_console_api_retries_total{route,reason}`, `vws_console_api_timeouts_total{method,route}`, `vws_console_auth_events_total{event,outcome}`, `vws_console_operation_poll_duration_seconds` and the Node.js process metrics (`vws_console_process_*`, `vws_console_nodejs_*`). |

| Variable       | Default     | Meaning                                                                                                                                                                                                                                                                      |
| -------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`         | `3000`      | App port: the console UI, `/healthz` and `/readyz`. `GET /metrics` here answers `404` with no body, in every sign-in mode.                                                                                                                                                   |
| `METRICS_PORT` | unset (off) | Metrics port. Unset, empty or `0` starts no listener. A whole number from 1 to 65535 starts one on all interfaces (not `HOSTNAME`), so the pod IP can be scraped. It answers only `GET` and `HEAD /metrics`; other paths are `404`. vws-deploy#612 sets `9464` in the chart. |

An invalid `METRICS_PORT`, or a port that is already in use, logs `metrics.listen` with `outcome:"error"` and `code` `InvalidMetricsPort` or the listen error (such as `EADDRINUSE`), and the console runs without metrics. A successful start logs `metrics.listen` with `outcome:"success"`. `/metrics` carries no secrets but is unauthenticated, like the other VWS services' ops endpoints; restrict `METRICS_PORT` to the scraper with a NetworkPolicy.

`route` is the console-api route template, such as `/vpcs/{id}/delete`, never a path with an ID, an object key or a query. `status_class` is `1xx` to `5xx`, or `none` when console-api never answered. `outcome` is `success` (below 400), `failure` (400 and up), `timeout` or `network`. `reason` is `timeout`, `network`, `429` or `5xx`. `api_timeouts_total` counts each attempt that hit the deadline, even when a later attempt answered.

**Label migration (#53).** Before #53, `vws_console_api_requests_total` and `vws_console_api_request_duration_seconds` were labelled `{method,outcome}` with `outcome` one of `1xx`…`5xx`, `timeout` or `network`. Now the status class has its own label and the duration histogram has no `outcome`:

| Old query                                                        | New query                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `vws_console_api_requests_total{outcome="5xx"}`                  | `vws_console_api_requests_total{status_class="5xx"}`                      |
| `vws_console_api_requests_total{outcome="2xx"}`                  | `vws_console_api_requests_total{outcome="success",status_class="2xx"}`    |
| `vws_console_api_requests_total{outcome="timeout"}`              | unchanged (`status_class="none"`)                                         |
| `vws_console_api_request_duration_seconds_bucket{outcome="2xx"}` | `vws_console_api_request_duration_seconds_bucket` by `method` and `route` |

## OpenTelemetry

The console server exports traces and metrics over OTLP/HTTP (JSON encoding) when an endpoint is set. Unset, it exports nothing and opens no connection for telemetry. Spans still get ids, so console-api calls carry `traceparent` and the auth log lines carry `trace_id` and `span_id`. Only the server is instrumented; no OpenTelemetry code ships to the browser (`scripts/check-client-bundle.sh` checks every build in CI).

A `traceparent` sent by the browser is ignored: every request starts its own trace, so a client cannot pick the trace id in the logs or switch off sampling. The console sends `traceparent` to console-api only.

| Variable                                                                    | Default       | Meaning                                                                                                                        |
| --------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                                               | unset (off)   | Collector base URL, such as `http://otel-collector:4318`. Traces go to `/v1/traces` and metrics to `/v1/metrics`.              |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | unset         | Full URL for one signal; it turns that signal on by itself.                                                                    |
| `OTEL_EXPORTER_OTLP_HEADERS`                                                | unset         | Headers for the collector, `key=value,key2=value2`. The console never logs them.                                               |
| `OTEL_SERVICE_NAME`                                                         | `vws-console` | `service.name` of every span and metric.                                                                                       |
| `OTEL_RESOURCE_ATTRIBUTES`                                                  | unset         | Extra resource attributes, `key=value,key2=value2`. Operators set these; put no credentials in them.                           |
| `OTEL_BSP_SCHEDULE_DELAY`                                                   | `5000`        | Milliseconds between span exports.                                                                                             |
| `OTEL_METRIC_EXPORT_INTERVAL`                                               | `60000`       | Milliseconds between metric exports.                                                                                           |
| `OTEL_SDK_DISABLED`                                                         | unset         | `true` installs no OpenTelemetry at all: no export, no `traceparent`, no trace ids in logs. Prometheus `/metrics` still works. |

gRPC is not shipped. On SIGTERM the console flushes buffered telemetry for up to 2 s; a crash loses what was not exported yet.

What is exported:

- **Traces.** One CLIENT span per console-api call, `console-api <METHOD> <route template>` (for example `console-api GET /vpcs/{id}`), with `http.request.method`, `http.response.status_code`, `url.template`, `vws.request_id` (the `X-Request-Id` sent), `vws.attempts`, `vws.iam_mode` and `error.type` (`timeout`, `network`, console-api's error code, or the status). A GET that is retried has one `retry` event per repeated attempt with `attempt`, `reason` and `backoff_ms`. Status is ERROR for a timeout, a network error or a 5xx. Every server action has a span `action <export name>`, the proxy's expired-cookie check is `vws.session_check` and the session read for the header is `vws.session`. Next.js's own spans are not exported, because they carry raw URLs with IDs and object keys.
- **Metrics.** The same `vws_console_*` instruments as `/metrics` above, with the same names and labels, without the Node.js process metrics.
- **No secrets.** No attribute, event, label or log field holds a password, MFA code, session, cookie, CSRF value, bearer token or request body. Attribute keys are a closed list in `src/lib/ops/span.ts`.

## Screens

| Screen          | Route                      |
| --------------- | -------------------------- |
| Instances       | `/compute/instances`       |
| Launch instance | `/compute/launch`          |
| Volumes         | `/storage/volumes`         |
| Security groups | `/network/security-groups` |
| VPCs            | `/network/vpcs`            |
| Buckets         | `/storage/buckets`         |

The left nav reaches each list screen. Launch is the header menu item and the Launch instances button.

## Empty account and sample data

The console opens on an empty account: no instances, volumes, or buckets, plus one default VPC and one default security group in **Europe (North)**. Other regions are empty.

The account menu in the header has **Show empty account** and **Show sample data**.

Launching an instance, or using Create on volumes, security groups, VPCs, or buckets, adds records in the current region. Refreshing the browser resets the session to the empty account.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
bash scripts/check-client-bundle.sh   # after the build: no OpenTelemetry exporter code in .next/static
npm run test:e2e:otel                 # after the build: a real OpenTelemetry Collector receives the spans and metrics
```

`npm run test:e2e:otel` starts the OpenTelemetry Collector `otelcol-contrib` 0.164.0 (`scripts/otelcol.sh` downloads it once into `.cache/otelcol` and checks its sha256), a deterministic fake console-api (`e2e-otel/fake-console-api.mts`) and the console. It drives a sign-in, a GET retried after a 503, a write and a timeout, then reads the Collector's file output.
