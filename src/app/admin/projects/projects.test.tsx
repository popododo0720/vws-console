import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveProjectAction } from "@/app/actions/admin";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import DetailPage from "./[project]/page";
import EditPage from "./[project]/edit/page";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/lib/vws-api/session", () => ({ currentSession: async () => ({ session: "sess-1", csrf: "csrf-1" }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/projects/123456789012",
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));

const ID = "123456789012";
const ACCOUNT = "210987654321";
const HERE = `/admin/projects/${ID}`;
const GET = `GET /projects/${ID}`;
const LIST = "vws:AdminListRegions";
const MAP = "vws:AdminMapProject";
const failure = (code: string, message: string) => ({ error: { code, message }, requestId: "req-7" });

type Reply = [number, unknown, HeadersInit?];
type Mapping = { version: number; pools: { region: string; pool: string }[]; awsAccounts: string[] };
const calls: string[] = [];
const saved = (): Mapping => ({ version: 3, pools: [{ region: "pve-lab-1", pool: "team-a" }], awsAccounts: [ACCOUNT] });

/**
 * console-api's project routes at the wire: a PUT with the current ETag and no unknown field stores its mapping,
 * which the next GET reads. `answers` replaces the answer of a "METHOD path".
 */
function adminApi(stored: Mapping, answers: Record<string, Reply> = {}) {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname.replace("/api/v1/admin", "");
    const method = init.method ?? "GET";
    const send = ([status, body, headers = { etag: `"${stored.version}"` }]: Reply) =>
      new Response(JSON.stringify(body), { status, headers });
    calls.push(`${method} ${path}`);
    const fixed = answers[`${method} ${path}`];
    if (fixed) return send(fixed);
    if (path === "/regions") return send([200, { items: [{ name: "pve-lab-1" }, { name: "pve-seoul-2" }] }]);
    if (method === "PUT") {
      const { pools, awsAccounts, ...unknown } = JSON.parse(String(init.body));
      if ((init.headers as Record<string, string>)["if-match"] !== `"${stored.version}"`) {
        return send([409, failure("Conflict", "registration already exists or changed")]);
      }
      if (Object.keys(unknown).length > 0) return send([400, failure("InvalidArgument", "unknown field")]);
      Object.assign(stored, { pools, awsAccounts, version: stored.version + 1 });
    }
    return send([200, { project: ID, pools: stored.pools, awsAccounts: stored.awsAccounts }]);
  });
}

type ProjectPage = typeof DetailPage;
const tree = async (page: ProjectPage, adminActions = [LIST, MAP]): Promise<ReactElement> => (
  <ConsoleProvider adminActions={adminActions}>
    {await page({ params: Promise.resolve({ project: ID }) })}
  </ConsoleProvider>
);
const show = async (page: ProjectPage, adminActions?: string[]) => render(await tree(page, adminActions));
const field = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;
const rows = () => screen.getAllByRole("row").map((row) => [...row.children].map((cell) => cell.textContent).join("|"));
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
/** The error a Field shows under its input. */
const fieldError = (label: string) =>
  screen.getByLabelText(label).closest("div")?.nextElementSibling?.textContent ?? null;

describe("admin project pages on a wire-level admin API", () => {
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
    vi.resetAllMocks();
    calls.length = 0;
  });

  it("shows a saved mapping as a Pools table and an AWS accounts table, with its version from the ETag", async () => {
    adminApi(saved());
    await show(DetailPage);
    expect(screen.getByRole("heading", { level: 1, name: ID })).toBeTruthy();
    expect(["Project ID", "Mapping", "Version"].map(field)).toEqual([ID, "Saved", "3"]);
    expect(rows()).toEqual(["Region|Pool", "pve-lab-1|team-a"]);
    expect(screen.getByRole("link", { name: "pve-lab-1" })).toHaveAttribute("href", "/admin/regions/pve-lab-1");
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", `${HERE}/edit`);
    click("AWS accounts");
    expect(rows()).toEqual(["AWS account ID", ACCOUNT]);
  });

  it("gives a caller without vws:AdminMapProject the mapping to read, no Edit link and no edit form", async () => {
    adminApi(saved());
    const detail = await show(DetailPage, [LIST]);
    expect(rows()).toEqual(["Region|Pool", "pve-lab-1|team-a"]);
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
    detail.unmount();
    await show(EditPage, [LIST]);
    expect(screen.getByRole("alert")).toHaveTextContent(
      /^Access deniedYou don't have permission to vws:AdminMapProject\./,
    );
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(screen.queryByLabelText(/^Pool in/)).toBeNull();
  });

  it("saves a mapped pool and AWS account once on a double click, and the detail page reads them back", async () => {
    adminApi({ version: 0, pools: [{ region: "pve-lab-1", pool: ID }], awsAccounts: [] });
    const form = await show(EditPage);
    expect(screen.getByLabelText("Pool in pve-seoul-2")).toHaveValue("");
    fill("Pool in pve-lab-1", " team-a ");
    click("Add AWS account");
    fill("AWS account ID", ACCOUNT);
    click("Save changes");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    click("Save changes");
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(HERE));
    expect(calls.filter((call) => call.startsWith("PUT"))).toEqual([`PUT /projects/${ID}`]);
    form.unmount();
    await show(DetailPage);
    expect(["Mapping", "Version"].map(field)).toEqual(["Saved", "1"]);
    expect(rows()).toEqual(["Region|Pool", "pve-lab-1|team-a"]);
    click("AWS accounts");
    expect(rows()).toEqual(["AWS account ID", ACCOUNT]);
  });

  it("shows console-api's 400 at the pool it names and above the buttons, and keeps what was typed", async () => {
    const message = "pool nope does not exist in region pve-lab-1";
    const refused = { error: { code: "InvalidArgument", message, field: "pools" }, requestId: "req-7" };
    adminApi(saved(), { [`PUT /projects/${ID}`]: [400, refused] });
    await show(EditPage);
    fill("Pool in pve-lab-1", "nope");
    click("Save changes");
    await waitFor(() => expect(fieldError("Pool in pve-lab-1")).toBe(message));
    expect(fieldError("Pool in pve-seoul-2")).toBeNull();
    expect(screen.getAllByRole("alert").at(-1)).toHaveTextContent(
      `The project could not be saved${message}InvalidArgument · Request ID req-7`,
    );
    expect(screen.getByLabelText("Pool in pve-lab-1")).toHaveValue("nope");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("asks for a reload and overwrites nothing when another administrator saved since the form opened", async () => {
    const stored = saved();
    adminApi(stored);
    const view = await show(EditPage);
    const theirs = [{ region: "pve-lab-1", pool: "theirs" }];
    Object.assign(stored, { version: 4, pools: theirs });
    // The page is rendered again with the newer version, as a change of ?region= does.
    view.rerender(await tree(EditPage));
    fill("Pool in pve-lab-1", "mine");
    click("Save changes");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^The project could not be savedregistration already exists or changed\. Reload the page .*Conflict · Request ID req-7$/,
    );
    expect(stored.pools).toEqual(theirs);
  });

  it.each<[string, unknown[]]>([
    ["an 11-digit project ID", ["12345678901", { pools: [], awsAccounts: [] }, '"3"']],
    ["a project ID with a path in it", [`${ID}/../x`, { pools: [], awsAccounts: [] }, '"3"']],
    ["an ETag that carries a header", [ID, { pools: [], awsAccounts: [] }, '"3"\r\nx-evil: 1']],
    ["a pool whose region is not text", [ID, { pools: [{ region: 7, pool: "a" }], awsAccounts: [] }, '"3"']],
    ["pools that are not a list", [ID, { pools: "a", awsAccounts: [] }, '"3"']],
    ["an 11-digit AWS account ID", [ID, { pools: [], awsAccounts: ["12345678901"] }, '"3"']],
  ])("saveProjectAction refuses %s without calling console-api", async (_case, [project, mapping, etag]) => {
    adminApi(saved());
    expect(await saveProjectAction(project, mapping, etag)).toMatchObject({ code: "InvalidArgument", requestId: null });
    expect(calls).toEqual([]);
  });

  it("shows access denied in place of either page when console-api answers 403", async () => {
    const denied: Reply = [403, failure("PermissionDenied", "administrator required")];
    adminApi(saved(), { [GET]: denied, "GET /regions": denied });
    for (const page of [DetailPage, EditPage]) {
      const view = await show(page);
      expect(screen.getByRole("alert")).toHaveTextContent(
        /^Access deniedYou don't have permission to vws:AdminListRegions\..*PermissionDenied · Request ID req-7$/,
      );
      expect(screen.getByRole("heading", { level: 1, name: "Projects" })).toBeTruthy();
      view.unmount();
    }
  });

  const both = [DetailPage, EditPage];
  it.each<[string, string, Reply, string, ProjectPage[]]>([
    ["a refused project ID", GET, [400, failure("InvalidArgument", "must be 12 digits")], "must be 12 digits", both],
    ["an answer without an ETag", GET, [200, { project: ID }, {}], "MalformedResponse · Request ID", both],
    [
      "no registered regions to read",
      "GET /regions",
      [503, failure("Unavailable", "down")],
      "downUnavailable",
      [EditPage],
    ],
    ["no such mapping", GET, [404, failure("NotFound", "gone")], "has no project mapping.NotFound", [EditPage]],
  ])("shows %s as a load error, never a blank page or a form", async (_case, route, reply, text, pages) => {
    adminApi(saved(), { [route]: reply });
    for (const page of pages) {
      const view = await show(page);
      expect(screen.getByRole("alert")).toHaveTextContent("The project could not be loaded");
      expect(screen.getByRole("alert")).toHaveTextContent(text);
      expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
      view.unmount();
    }
  });
});
