// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));

import { startMemoryTelemetry, type MemoryTelemetry } from "@/lib/ops/memory-telemetry";
import * as auth from "./auth";
import * as resources from "./resources";

/** Every export of a "use server" module is a server action, so each must open its own span. */
const actions = Object.entries({ ...resources, ...auth } as Record<string, unknown>).flatMap(([name, value]) =>
  typeof value === "function" ? [[name, value as () => Promise<unknown>] as const] : [],
);

describe("server action spans", () => {
  let telemetry: MemoryTelemetry;

  beforeEach(() => {
    telemetry = startMemoryTelemetry();
    vi.stubEnv("VWS_CONSOLE_API_URL", "");
    vi.stubGlobal("fetch", async () => {
      throw new Error("no console-api in this test");
    });
  });

  afterEach(async () => {
    await telemetry.shutdown();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("finds every action", () => {
    expect(actions.length).toBeGreaterThanOrEqual(34);
  });

  it.each(actions)("%s emits an `action <name>` span, even on bad input", async (name, action) => {
    await action().catch(() => undefined);
    const spans = await telemetry.spans();
    expect(spans.map((span) => span.name)).toContain(`action ${name}`);
  });
});
