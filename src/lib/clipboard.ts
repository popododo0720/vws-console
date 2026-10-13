import { reportClientError } from "@/lib/client-error";

export async function copyToClipboard(text: string, context: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    reportClientError(error, context);
    return false;
  }
}
