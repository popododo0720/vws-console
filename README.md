# VWS console

A local mock of a cloud operations console. It covers six screens: instances, the launch form, volumes, security groups, VPCs, and buckets. All records stay in the browser session. There are no cloud credentials and no calls to a cloud provider.

The on-screen product name is VWS. Service menus use the names from the reference console screens. The header mark is the VWS wordmark.

The app was scaffolded from the MIT-licensed [ai-website-cloner-template](https://github.com/JCodesMore/ai-website-cloner-template). The clone workflow (map, observe, build, compare) is in `.agents/skills/clone-website/`. Reference screenshots are used locally only (`docs/design-references/console/`, gitignored) and are not committed to the repo.

## Run

```bash
npm install
npm run dev -- -p 43123 -H 0.0.0.0
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123). Node.js 22 or newer is enough. The template's Docker files still expect Node 24.

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
