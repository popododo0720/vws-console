import { context, isSpanContextValid, propagation, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { isNextRouterError } from "next/dist/client/components/is-next-router-error";
import type { IamState } from "@/lib/vws-api/mode";

/**
 * The instrumentation scope of every console span. telemetry.ts exports only this scope, so Next's own
 * spans, which carry raw URLs with IDs and object keys, never leave the process.
 */
export const TELEMETRY_SCOPE = "vws-console";

/** Why a GET is sent again; a closed set, so the retry metric and event stay low-cardinality. */
export type RetryReason = "timeout" | "network" | "429" | "5xx";

/**
 * Every attribute a console span may carry. Adding one means adding it here, which is the review point
 * for "could this hold a secret". No value is ever a header, a cookie, a body or a user-entered field.
 */
export type SpanAttributes = Partial<{
  "http.request.method": string;
  "http.response.status_code": number;
  "url.template": string;
  "error.type": string;
  "vws.request_id": string;
  "vws.attempts": number;
  "vws.iam_mode": IamState;
  "vws.outcome": "rejected" | "kept" | "unconfirmed";
}>;

export type SpanName = `console-api ${string}` | `action ${string}` | "vws.session_check" | "vws.session";

/** What traced code may do to its own span: closed attributes, a retry event, and marking it failed. */
export type ActiveSpan = {
  set(attributes: SpanAttributes): void;
  retry(event: { attempt: number; reason: RetryReason; backoff_ms: number }): void;
  /** Sets `error.type` and status ERROR. A thrown error that was not marked becomes `error.type` "internal". */
  fail(errorType: string): void;
};

/**
 * Runs `run` inside an active span that ends in `finally`. The error text is never recorded. Next's redirect
 * and notFound signals are control flow, so they are rethrown without marking the span failed.
 * Without a tracer provider (OTEL_SDK_DISABLED, unit tests) the span is a no-op.
 */
export function withSpan<T>(
  name: SpanName,
  kind: "client" | "internal",
  attributes: SpanAttributes,
  run: (span: ActiveSpan) => Promise<T>,
): Promise<T> {
  const options = { kind: kind === "client" ? SpanKind.CLIENT : SpanKind.INTERNAL, attributes };
  return trace.getTracer(TELEMETRY_SCOPE).startActiveSpan(name, options, async (span) => {
    let failed = false;
    const active: ActiveSpan = {
      set: (values) => span.setAttributes(values),
      retry: (event) => span.addEvent("retry", event),
      fail: (errorType) => {
        failed = true;
        span.setAttribute("error.type", errorType);
        span.setStatus({ code: SpanStatusCode.ERROR });
      },
    };
    try {
      return await run(active);
    } catch (error) {
      if (!failed && !isNextRouterError(error)) active.fail("internal");
      throw error;
    } finally {
      span.end();
    }
  });
}

/** The span of a server action, named after its export so the structural test can find every one. */
export function withActionSpan<T>(action: string, run: () => Promise<T>): Promise<T> {
  return withSpan(`action ${action}`, "internal", {}, () => run());
}

/** `traceparent` and `tracestate` for the active span; never baggage. Empty without a provider. */
export function traceHeaders(): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  const headers: Record<string, string> = {};
  if (carrier.traceparent) headers.traceparent = carrier.traceparent;
  if (carrier.tracestate) headers.tracestate = carrier.tracestate;
  return headers;
}

/** The active span's ids for a log line, or null outside a valid span. Lowercase hex, never caller-supplied. */
export function activeTraceIds(): { trace_id: string; span_id: string } | null {
  const span = trace.getActiveSpan()?.spanContext();
  return span && isSpanContextValid(span) ? { trace_id: span.traceId, span_id: span.spanId } : null;
}
