# Route map

Source evidence is the attached console screenshots in `docs/design-references/console/`. The live console requires a signed-in account, so those images are the observation source. Routes below are local.

| Screenshot | Local route | Owner |
| --- | --- | --- |
| `instances-empty.png` | `/compute/instances` | `src/components/sites/console/instances-view.tsx` |
| `launch-top.png`, `launch-scrolled.png` | `/compute/launch` | `src/components/sites/console/launch-view.tsx` |
| `volumes-empty.png` | `/storage/volumes` | `src/components/sites/console/volumes-view.tsx` |
| `security-groups.png` | `/network/security-groups` | `src/components/sites/console/security-groups-view.tsx` |
| `vpcs.png` | `/network/vpcs` | `src/components/sites/console/vpcs-view.tsx` |
| `buckets-empty.png` | `/storage/buckets` | `src/components/sites/console/buckets-view.tsx` |

Shared chrome: `shell.tsx`, `top-bar.tsx`, `side-nav.tsx`, `resource-table.tsx`, `detail-dock.tsx`.

Data shapes live in `src/types/console.ts`: `Instance`, `Volume`, `SecurityGroup`, `Vpc`, `Bucket`, `NavTree`. Screens read the current region slice from `ConsoleProvider`.
