import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

type AnyValue = { stringValue?: string; intValue?: string | number; boolValue?: boolean; doubleValue?: number };
type KeyValue = { key: string; value: AnyValue };
type OtlpSpan = { name: string; attributes?: KeyValue[]; events?: { name: string; attributes?: KeyValue[] }[] };
type Line = {
  resourceSpans?: {
    resource?: { attributes?: KeyValue[] };
    scopeSpans?: { scope?: { name?: string }; spans?: OtlpSpan[] }[];
  }[];
  resourceMetrics?: { scopeMetrics?: { scope?: { name?: string }; metrics?: { name: string }[] }[] }[];
};

/** What the Collector's file exporter wrote: one OTLP JSON document per line. */
function collected() {
  const out = process.env.OTEL_E2E_OUT!;
  const raw = existsSync(out) ? readFileSync(out, "utf8") : "";
  const lines = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Line);
  const spans: (OtlpSpan & { scope: string; service: string })[] = [];
  const metrics = new Set<string>();
  for (const line of lines) {
    for (const resource of line.resourceSpans ?? []) {
      const service = resource.resource?.attributes?.find((a) => a.key === "service.name")?.value.stringValue ?? "";
      for (const scope of resource.scopeSpans ?? []) {
        for (const span of scope.spans ?? []) spans.push({ ...span, scope: scope.scope?.name ?? "", service });
      }
    }
    for (const resource of line.resourceMetrics ?? []) {
      for (const scope of resource.scopeMetrics ?? [])
        for (const metric of scope.metrics ?? []) metrics.add(metric.name);
    }
  }
  return { raw, spans, metrics };
}

const attr = (attributes: KeyValue[] | undefined, key: string) => {
  const value = attributes?.find((a) => a.key === key)?.value;
  return value?.stringValue ?? (value?.intValue === undefined ? undefined : Number(value.intValue));
};

const REQUIRED_SPANS = [
  "action loginAction",
  "console-api POST /auth/login",
  "vws.session",
  "console-api GET /vpcs",
  "action createVpcAction",
  "console-api POST /vpcs",
  "console-api GET /operations/{id}",
  "console-api GET /snapshots",
];

const REQUIRED_METRICS = [
  "vws_console_api_requests_total",
  "vws_console_api_request_duration_seconds",
  "vws_console_api_retries_total",
  "vws_console_api_timeouts_total",
  "vws_console_auth_events_total",
  "vws_console_operation_poll_duration_seconds",
];

test("a sign-in, a retried GET, a write and a timeout reach the Collector as console spans and metrics", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Account ID").fill("123456789012");
  await page.getByLabel("User name").fill("root");
  await page.getByLabel("Password").fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/compute\/instances/);

  // The fake console-api answers the first GET /vpcs with a 503; the console retries and the page loads.
  await page.goto("/network/vpcs");
  await expect(page.getByText("VPCs could not be loaded")).toHaveCount(0);
  await page.getByRole("button", { name: "Create VPC" }).first().click();
  await page.getByRole("dialog").getByLabel("IPv4 CIDR").fill("10.42.0.0/16");
  await page.getByRole("dialog").getByRole("button", { name: "Create VPC" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // GET /snapshots never answers: three attempts hit the 500 ms deadline.
  await page.goto("/storage/snapshots");

  await expect
    .poll(
      () => {
        const { spans, metrics } = collected();
        const names = new Set(spans.map((span) => span.name));
        return [
          ...REQUIRED_SPANS.filter((name) => !names.has(name)),
          ...REQUIRED_METRICS.filter((m) => !metrics.has(m)),
        ];
      },
      { message: "spans and metrics still missing from the Collector output", timeout: 30_000 },
    )
    .toEqual([]);

  const { raw, spans } = collected();
  const named = (name: string) => spans.filter((span) => span.name === name);

  expect(new Set(spans.map((span) => span.scope)), "only the console's own scope is exported").toEqual(
    new Set(["vws-console"]),
  );
  expect(new Set(spans.map((span) => span.service))).toEqual(new Set(["vws-console"]));
  expect(
    spans.filter((span) => /^(fetch |GET \/|POST \/|render route|executing api route)/.test(span.name)),
    "no Next.js span with a raw URL",
  ).toEqual([]);

  const [signIn] = named("console-api POST /auth/login");
  expect(attr(signIn.attributes, "vws.attempts")).toBe(1);
  expect(attr(signIn.attributes, "http.response.status_code")).toBe(200);
  expect(attr(signIn.attributes, "vws.iam_mode")).toBe("on");

  const retried = named("console-api GET /vpcs").find((span) => attr(span.attributes, "vws.attempts") === 2)!;
  expect(retried, "the 503 GET /vpcs was retried once").toBeTruthy();
  expect(retried.events?.map((event) => event.name)).toEqual(["retry"]);
  expect(attr(retried.events![0].attributes, "reason")).toBe("5xx");
  expect(attr(retried.events![0].attributes, "backoff_ms")).toEqual(expect.any(Number));

  for (const write of named("console-api POST /vpcs")) {
    expect(attr(write.attributes, "vws.attempts")).toBe(1);
    expect(attr(write.attributes, "http.response.status_code")).toBe(202);
  }

  const [timedOut] = named("console-api GET /snapshots");
  expect(attr(timedOut.attributes, "error.type")).toBe("timeout");
  expect(attr(timedOut.attributes, "vws.attempts")).toBe(3);

  for (const secret of [process.env.E2E_PASSWORD!, process.env.E2E_SESSION!, process.env.E2E_CSRF!]) {
    expect(raw, "no secret in the Collector output").not.toContain(secret);
  }
});
