#!/usr/bin/env bash
set -euo pipefail

mkdir -p .tmp-198
runner=$(mktemp -d "$PWD/.tmp-198/runner.XXXXXX")
trap 'rm -rf "$runner"' EXIT

cp -a .next/standalone/. "$runner/"
mkdir -p "$runner/.next/static" "$runner/src/lib/vws-api"
cp -a .next/static/. "$runner/.next/static/"
cp -a public "$runner/public"
cp -a server "$runner/server"
cp src/lib/instance-id.ts "$runner/src/lib/instance-id.ts"
cp src/lib/vws-api/session-cookies.ts "$runner/src/lib/vws-api/session-cookies.ts"

# The config runs Docker's CMD in the copied directory and probes /healthz before the relay scenarios.
E2E_RELAY_STANDALONE_DIR="$runner" npx playwright test -c playwright.relay.config.ts
