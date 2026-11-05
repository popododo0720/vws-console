#!/usr/bin/env bash
# Runs the pinned OpenTelemetry Collector (contrib) for the OTel e2e, downloading it once with a checked sha256.
# Usage: scripts/otelcol.sh --config <file>   (OTELCOL_CACHE overrides the cache directory)
set -euo pipefail

version="0.164.0"
sha256="f0c1ce9f661399beb4a58b711924716e08ea70c3802db0715fcfde3cbbada2d4"
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) ;;
  *) echo "otelcol.sh: only linux amd64 is pinned (got $(uname -s)-$(uname -m))" >&2; exit 2 ;;
esac

cache="${OTELCOL_CACHE:-$(cd "$(dirname "$0")/.." && pwd)/.cache/otelcol/$version}"
bin="$cache/otelcol-contrib"
if [[ ! -x "$bin" ]]; then
  archive="otelcol-contrib_${version}_linux_amd64.tar.gz"
  url="https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${version}/${archive}"
  mkdir -p "$(dirname "$cache")"
  download=$(mktemp -d "$(dirname "$cache")/.download.XXXXXX")
  trap 'rm -rf "$download"' EXIT
  echo "otelcol.sh: downloading $archive" >&2
  curl -fsSL --retry 3 -o "$download/$archive" "$url"
  echo "$sha256  $download/$archive" | sha256sum -c --quiet -
  mkdir -p "$download/out"
  tar -xzf "$download/$archive" -C "$download/out" otelcol-contrib
  mkdir -p "$cache"
  mv "$download/out/otelcol-contrib" "$bin"
  rm -rf "$download"
  trap - EXIT
fi
exec "$bin" "$@"
