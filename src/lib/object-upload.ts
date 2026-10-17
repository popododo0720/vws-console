export const MAX_OBJECT_BYTES = 4 * 1024 * 1024;
const MULTIPART_FRAMING_BYTES = 64 * 1024;
export const SERVER_ACTION_BODY_LIMIT_BYTES = MAX_OBJECT_BYTES + MULTIPART_FRAMING_BYTES;

export function objectKeyProblem(key: string): string | null {
  if (key.length < 1 || key.length > 1024 || key.startsWith("/") || key.includes("\0")) {
    return "Object keys must be 1–1024 characters and cannot start with a slash.";
  }
  for (const char of key) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || (code >= 127 && code <= 159)) return "Object keys cannot contain control characters.";
  }
  if (key.split("/").some((part) => part === "." || part === "..")) {
    return "Object keys cannot contain . or .. segments.";
  }
  return null;
}
