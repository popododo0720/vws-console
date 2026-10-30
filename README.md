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

The console is a VWS service: it is deployed to Kubernetes like the other `vws-*` components, so it serves the same probe and scrape endpoints (decision for #68). They answer without sign-in (the proxy skips them), are never cached, and never print configuration values, tokens or console-api responses.

| Endpoint       | Purpose                                                                                                                                                                                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /healthz` | Liveness. `200` `{"status":"ok"}` while the server answers; it checks no dependency, so a console-api outage does not restart the console.                                                                                                                                                           |
| `GET /readyz`  | Readiness. `200` when `VWS_CONSOLE_IAM` and `VWS_CONSOLE_API_URL` are valid and, if `VWS_CONSOLE_API_URL` is set, console-api answers one unauthenticated `GET /api/v1/auth/session` below 500 within 2 s. Otherwise `503` with `{"status":"unavailable","checks":[{"name","status","reason"}]}`.    |
| `GET /metrics` | Prometheus text. Every metric starts with `vws_console_`: `vws_console_http_requests_total{method}`, `vws_console_api_requests_total{method,outcome}`, `vws_console_api_request_duration_seconds{method,outcome}` and the Node.js process metrics (`vws_console_process_*`, `vws_console_nodejs_*`). |

`/metrics` carries no secrets but is unauthenticated, like the other VWS services' ops endpoints; restrict it to the scraper with a NetworkPolicy. OpenTelemetry traces are not exported yet; #53 tracks them.

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
```
