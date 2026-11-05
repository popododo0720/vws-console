/**
 * Runs once when the console server starts: install OpenTelemetry, report an invalid VWS_CONSOLE_IAM and start
 * the metrics listener. Telemetry goes first so the metrics listener's log line already sees the providers.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startTelemetry } = await import("@/lib/ops/telemetry");
  startTelemetry();
  const { forcedMode, IamConfigError, reportInvalidConfig } = await import("@/lib/vws-api/mode");
  if (forcedMode() instanceof IamConfigError) reportInvalidConfig();
  const { startMetricsServer } = await import("@/lib/ops/metrics-server");
  startMetricsServer();
}
