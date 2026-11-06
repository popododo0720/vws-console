#!/usr/bin/env bash
# Shows check-client-bundle.sh passes a clean bundle and fails on planted exporter code or the endpoint.
set -euo pipefail

script="$(dirname "$0")/check-client-bundle.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
sentinel="http://otlp-endpoint-sentinel.invalid:4318"

mkdir -p "$work/clean/chunks"
echo 'label("OTLP endpoint (empty turns exporting off)")' >"$work/clean/chunks/page.js"
bash "$script" "$work/clean" "$sentinel" >/dev/null || { echo "FAIL: a clean bundle was rejected"; exit 1; }

cp -r "$work/clean" "$work/exporter"
echo 'class OTLPTraceExporter extends OTLPExporterBase {}' >"$work/exporter/chunks/otel.js"
if bash "$script" "$work/exporter" "$sentinel" 2>/dev/null; then echo "FAIL: exporter code passed"; exit 1; fi

cp -r "$work/clean" "$work/endpoint"
echo "fetch(\"$sentinel/v1/traces\")" >"$work/endpoint/chunks/app.js.map"
if bash "$script" "$work/endpoint" "$sentinel" 2>/dev/null; then echo "FAIL: the endpoint passed"; exit 1; fi

if bash "$script" "$work/missing" "$sentinel" 2>/dev/null; then echo "FAIL: a missing build passed"; exit 1; fi

echo "check-client-bundle_test: ok"
