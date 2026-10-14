/** Runs once when the console server starts: report an invalid VWS_CONSOLE_IAM straight away. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { forcedMode, IamConfigError, reportInvalidConfig } = await import("@/lib/vws-api/mode");
  if (forcedMode() instanceof IamConfigError) reportInvalidConfig();
}
