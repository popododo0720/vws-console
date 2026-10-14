/**
 * The one place that decides whether the console signs users in (IAM on) or calls console-api with
 * the server-side VWS_CONSOLE_API_TOKEN bearer (IAM off, the default).
 *
 * TODO(#50): replace the env switch with what console-api advertises (GET /api/v1/auth/session or a
 * capability flag) once vws-api confirms the interface. Keep every caller on iamMode() so only this
 * function changes; it is already async-free and dependency-free so the proxy can call it too.
 */
export type IamMode = "on" | "off";

export function iamMode(): IamMode {
  return process.env.VWS_CONSOLE_IAM?.trim().toLowerCase() === "on" ? "on" : "off";
}

export function iamEnabled(): boolean {
  return iamMode() === "on";
}
