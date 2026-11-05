import { reportClientError } from "@/lib/client-error";
import { parseApiError, type ApiError } from "@/lib/vws-api/adapter";

/** Longer than console-api's three GET attempts at the default 10 s each, so the server gives up first. */
const DOWNLOAD_TIMEOUT_MS = 45_000;

type Navigate = (url: string) => void;

const assign: Navigate = (url) => window.location.assign(url);

function signInAgain(navigate: Navigate) {
  const next = `${window.location.pathname}${window.location.search}`;
  navigate(`/login?${new URLSearchParams({ reason: "expired", next })}`);
}

/**
 * Fetches one object from the download route and saves it. Resolves to the error to show, or null when the
 * file was saved or the browser was sent to sign in. A redirect is never followed: the sign-in page must not
 * be saved as the object.
 */
export async function download(href: string, fileName: string, navigate: Navigate = assign): Promise<ApiError | null> {
  let response: Response;
  try {
    response = await fetch(href, {
      credentials: "same-origin",
      redirect: "manual",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
  } catch (error) {
    reportClientError(error, "download");
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return timedOut
      ? { code: "RequestTimeout", message: "The download did not finish in time.", requestId: null }
      : { code: "ServiceUnavailable", message: "The download could not be started.", requestId: null };
  }
  if (response.type === "opaqueredirect") {
    signInAgain(navigate);
    return null;
  }
  if (!response.ok) {
    const parsed = parseApiError(await response.json().catch(() => null));
    return (
      parsed ?? {
        code: "ServiceUnavailable",
        message: `The download failed with status ${response.status}.`,
        requestId: null,
      }
    );
  }
  let blob: Blob;
  try {
    blob = await response.blob();
  } catch (error) {
    reportClientError(error, "download");
    return { code: "ServiceUnavailable", message: "The download was interrupted.", requestId: null };
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
  return null;
}
