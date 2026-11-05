#!/usr/bin/env bash
# Fails when the browser bundle holds OpenTelemetry SDK or exporter code, or the OTLP endpoint the build saw.
# Usage: scripts/check-client-bundle.sh [static-dir] [endpoint-sentinel]
# Run after `npm run build`; CI builds with a sentinel OTEL_EXPORTER_OTLP_ENDPOINT and passes it here.
set -euo pipefail

dir="${1:-.next/static}"
sentinel="${2:-${OTEL_EXPORTER_OTLP_ENDPOINT:-}}"

if [[ ! -d "$dir" ]]; then
  echo "check-client-bundle: $dir does not exist; run npm run build first" >&2
  exit 2
fi

# Identifiers of the SDK and the OTLP exporters, not the word OTLP: the installer form labels its OTLP field.
patterns=(
  OTLPTraceExporter
  OTLPMetricExporter
  OTLPExporterBase
  otlp-exporter-base
  exporter-trace-otlp
  exporter-metrics-otlp
  OTEL_EXPORTER_OTLP
  BatchSpanProcessor
  PeriodicExportingMetricReader
  AsyncLocalStorageContextManager
  "@opentelemetry/sdk-"
)
if [[ -n "$sentinel" ]]; then patterns+=("$sentinel"); fi

args=()
for pattern in "${patterns[@]}"; do args+=(-e "$pattern"); done

if hits=$(grep -rlF "${args[@]}" "$dir"); then
  echo "check-client-bundle: OpenTelemetry exporter code or the OTLP endpoint is in the browser bundle:" >&2
  while IFS= read -r file; do
    found=$(grep -oF "${args[@]}" "$file" | sort -u | paste -sd, -)
    echo "  $file: $found" >&2
  done <<<"$hits"
  exit 1
fi

echo "check-client-bundle: $dir is clean (${#patterns[@]} patterns, $(find "$dir" -type f | wc -l) files)"
