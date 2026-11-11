import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import ListPage from "./page";
import DetailPage from "./[name]/page";

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/lib/vws-api/session", () => ({ currentSession: async () => ({ session: "sess-1", csrf: "csrf-1" }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/regions",
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const SECRET = "pve-token-secret-value";
const region = {
  name: "pve-lab-1",
  clusterName: "lab",
  pveApiUrl: "https://pve1.lab.example:8006",
  tokenId: "vws@pve!inventory",
  tokenSecret: { set: true, fingerprint: "3f9a2c1d", value: SECRET },
  regionEndpoint: "https://10.0.0.10:8443",
  zones: [{ letter: "a", nodes: ["pve1", "pve2"] }],
};
const health = {
  status: "ok",
  quorate: true,
  leader: "pve1",
  nodes: ["pve1", "pve2", "pve3"].map((name) => ({ name, online: name !== "pve3" })),
  lastError: { time: "2026-11-11T08:26:38Z", message: "cluster status read failed" },
  checkedAt: "2026-11-11T09:00:00Z",
};
const accounts = {
  items: [{ awsAccountId: "123456789012", externalId: { set: true }, allowedRegions: ["us-east-1"] }],
};
const failure = (code: string, message: string) => ({ error: { code, message }, requestId: "req-7" });

/** The mocked admin API: one [status, body] per path under /api/v1/admin; any other path is not registered. */
function adminApi(replies: Record<string, [number, unknown]>) {
  vi.stubGlobal("fetch", async (url: string) => {
    const path = new URL(url).pathname.replace("/api/v1/admin", "");
    const [status, body] = replies[path] ?? [404, failure("NotFound", "registration not found")];
    return new Response(JSON.stringify(body), { status });
  });
}

const show = async (page: Promise<ReactElement>) => render(<ConsoleProvider>{await page}</ConsoleProvider>);
const detail = (name = "pve-lab-1") => show(DetailPage({ params: Promise.resolve({ name }) }));
const field = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;
const cells = (name: string) =>
  within(screen.getByText(name).closest("tr")!)
    .getAllByRole("cell")
    .map((cell) => cell.textContent)
    .join("|");

describe("admin Regions pages on a mocked admin API", () => {
  beforeEach(() => {
    vi.stubEnv("VWS_CONSOLE_API_URL", "http://api.test");
    vi.stubEnv("VWS_CONSOLE_IAM", "on");
    // No wait between the transport's GET retries.
    vi.spyOn(Math, "random").mockReturnValue(0);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists Proxmox clusters with their health and AWS account regions with dashes", async () => {
    adminApi({
      "/regions": [200, { items: [region] }],
      "/regions/pve-lab-1/health": [200, health],
      "/aws-accounts": [200, accounts],
    });
    await show(ListPage());
    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent?.trim());
    expect(headers.join("|")).toBe(
      "|Region name|Type|Status|Quorum|Leader|Online nodes|Cluster name|AWS account ID|Last error",
    );
    expect(cells("pve-lab-1")).toBe("|pve-lab-1|Proxmox|Available|Quorate|pve1|2/3|lab|—|cluster status read failed");
    expect(cells("us-east-1")).toBe("|us-east-1|AWS|—|—|—|—|—|123456789012|—");
    expect(screen.getByRole("link", { name: "pve-lab-1" })).toHaveAttribute("href", "/admin/regions/pve-lab-1");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Regions (2)");
  });

  it("shows an unreachable region and a health read that failed instead of a blank row", async () => {
    const down = { ...health, status: "unreachable", quorate: false, leader: null, nodes: [] };
    adminApi({
      "/regions": [200, { items: [region, { ...region, name: "pve-lab-2" }] }],
      "/regions/pve-lab-1/health": [200, down],
      "/aws-accounts": [200, { items: [] }],
    });
    await show(ListPage());
    expect(cells("pve-lab-1")).toBe("|pve-lab-1|Proxmox|Unreachable|—|—|—|lab|—|cluster status read failed");
    expect(cells("pve-lab-2")).toBe(
      "|pve-lab-2|Proxmox|Unknown|—|—|—|lab|—|registration not found (NotFound · Request ID —)",
    );
  });

  it("reports an admin API failure with its code and request ID and keeps the rows that loaded", async () => {
    adminApi({
      "/regions": [503, failure("Unavailable", "admin registry unavailable")],
      "/aws-accounts": [200, accounts],
    });
    await show(ListPage());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Proxmox regions could not be loadedadmin registry unavailableUnavailable · Request ID req-7",
    );
    expect(cells("us-east-1")).toContain("|AWS|");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Regions$/);
  });

  it("shows the AWS access-denied alert in place of either page when console-api answers 403", async () => {
    const denied: [number, unknown] = [403, failure("PermissionDenied", "administrator required")];
    const paths = ["/regions", "/aws-accounts", "/regions/pve-lab-1", "/regions/pve-lab-1/health"];
    adminApi(Object.fromEntries(paths.map((path) => [path, denied])));
    for (const open of [() => show(ListPage()), () => detail()]) {
      const view = await open();
      expect(screen.getByRole("alert")).toHaveTextContent(
        /^Access deniedYou don't have permission to vws:AdminListRegions\..*PermissionDenied · Request ID req-7$/,
      );
      expect(screen.queryByRole("table")).toBeNull();
      expect(screen.queryByRole("link", { name: "Regions" })).toBeNull();
      view.unmount();
    }
  });

  it("shows registration details, the secret as Set and its fingerprint, the status panel and the zones", async () => {
    adminApi({ "/regions/pve-lab-1": [200, region], "/regions/pve-lab-1/health": [200, health] });
    const view = await detail();
    expect(screen.getByRole("heading", { level: 1, name: "pve-lab-1" })).toBeTruthy();
    const labels = "Cluster name|Proxmox API URL|Region endpoint|API token ID|API token secret";
    expect(labels.split("|").map(field).join("|")).toBe(
      "lab|https://pve1.lab.example:8006|https://10.0.0.10:8443|vws@pve!inventory|Set · 3f9a2c1d",
    );
    expect(view.container.textContent).not.toContain(SECRET);
    const status = "Status|Quorum|Leader|Online nodes|Last error|Last error time|Last checked|pve1|pve3";
    expect(status.split("|").map(field).join("|")).toBe(
      "Available|Quorate|pve1|2/3|cluster status read failed|2026/11/11 08:26 GMT+0|2026/11/11 09:00 GMT+0|Online|Offline",
    );
    fireEvent.click(screen.getByRole("button", { name: "Availability Zones" }));
    expect(field("pve-lab-1a")).toBe("pve1, pve2");
  });

  it.each([
    [{ set: true, fingerprint: SECRET }, "Set"],
    [{ set: false, fingerprint: "3f9a2c1d" }, "Not set"],
    [SECRET, "Not set"],
  ])("renders the secret field %j as %s, never as a value", async (tokenSecret, label) => {
    adminApi({ "/regions/pve-lab-1": [200, { ...region, tokenSecret }] });
    const view = await detail();
    expect(field("API token secret")).toBe(label);
    expect(view.container.textContent).not.toContain(SECRET);
  });

  it("says a region is not registered, and shows a failed read, instead of a blank page", async () => {
    adminApi({ "/regions/bad": [400, failure("InvalidArgument", "invalid Proxmox region name")] });
    const missing = await detail("pve-gone-9");
    expect(screen.getByText("Region not found").nextElementSibling).toHaveTextContent(
      "pve-gone-9 is not a registered region.",
    );
    missing.unmount();
    await detail("bad");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The region could not be loadedinvalid Proxmox region nameInvalidArgument · Request ID req-7",
    );
  });
});
