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

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server. Pass `-p <port>` and `-H <host>`; the default is port 3000 on localhost. |
| `npm run build` then `npm start -- -p 43123 -H 0.0.0.0` | Production build and server. |
| `npm run check` | Lint, typecheck, and build. Run it before opening a PR. |

No environment variables are required, and no `.env` file is read by the app. `PORT` and `DEV_PORT` only change the host ports in `docker-compose.yml`.

Check it is up: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:43123/compute/instances` prints `200`. The root path `/` redirects (307) to the instances screen.

## Connect to console-api

The Instances, Volumes, VPCs and Subnets screens read and change resources through the vws-console-api JSON surface (`/api/v1`). Only the console server calls it, with a bearer token that never reaches the browser. Mutations send an `Idempotency-Key` and wait for the returned operation to finish.

| Variable | Meaning |
| --- | --- |
| `VWS_CONSOLE_API_URL` | Base URL of the console surface, for example `http://127.0.0.1:8080` |
| `VWS_CONSOLE_API_TOKEN` | The same value as console-api's `-console-token` |

Without them those screens show a `ConsoleNotConfigured` error. The other screens still use local data.

`npx playwright test -c playwright.live.config.ts` starts console-api with its fake backend (`VWS_CONSOLE_API_DIR`, default `../vws-console-api`, needs Go) and runs the live tests against it.

## Screens

| Screen | Route |
| --- | --- |
| Instances | `/compute/instances` |
| Launch instance | `/compute/launch` |
| Volumes | `/storage/volumes` |
| Security groups | `/network/security-groups` |
| VPCs | `/network/vpcs` |
| Buckets | `/storage/buckets` |

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
