import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseBucketName, type ApiError } from "@/lib/vws-api/adapter";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { BucketDetailView } from "@/components/sites/console/bucket-detail-view";
import { UploadView } from "@/components/sites/console/upload-view";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  search: "",
}));

const actions = vi.hoisted(() => ({
  uploadObjectAction: vi.fn(async () => null as ApiError | null),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/storage/buckets/logs-1",
  useRouter: () => ({
    push: nav.push,
    refresh: nav.refresh,
    replace: (url: string) => {
      nav.replace(url);
      nav.search = url.includes("?") ? (url.split("?")[1] ?? "") : "";
    },
  }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/actions/resources", () => ({
  uploadObjectAction: actions.uploadObjectAction,
}));

function logsBucket() {
  const name = parseBucketName("logs-1");
  if (!name) throw new Error("logs-1");
  return { name, ownerId: "123", created: "2026-08-02T00:00:00Z" };
}

describe("BucketDetailView", () => {
  beforeEach(() => {
    nav.search = "";
  });

  it("opens an API bucket and does not list session objects", () => {
    render(
      <ConsoleProvider>
        <BucketDetailView name="logs-1" bucket={logsBucket()} loadError={null} />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /—/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Show sample data" }));
    expect(screen.queryByText("Bucket not found")).toBeNull();
    expect(screen.queryByText("vws-logs")).toBeNull();
    expect(screen.getByText("This console cannot list objects in this bucket.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "properties" }));
    expect(screen.getByText("Aug 2, 2026, 12:00:00 AM UTC")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows a load error instead of claiming the bucket is missing", () => {
    render(
      <ConsoleProvider>
        <BucketDetailView
          name="logs-1"
          bucket={null}
          loadError={{ code: "ServiceUnavailable", message: "The VWS console API did not answer.", requestId: null }}
        />
      </ConsoleProvider>,
    );
    expect(screen.getByText("The bucket could not be loaded")).toBeTruthy();
    expect(screen.queryByText("Bucket not found")).toBeNull();
  });
});

describe("UploadView", () => {
  beforeEach(() => {
    nav.push.mockReset();
    actions.uploadObjectAction.mockReset();
    actions.uploadObjectAction.mockResolvedValue(null);
  });

  it("stores a file through the API and says the object cannot be listed", async () => {
    render(
      <ConsoleProvider>
        <UploadView name="logs-1" bucket={logsBucket()} loadError={null} />
      </ConsoleProvider>,
    );
    expect(screen.queryByText("Bucket not found")).toBeNull();
    const input = screen.getByLabelText("Add files");
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() => expect(actions.uploadObjectAction).toHaveBeenCalled());
    const form = actions.uploadObjectAction.mock.calls[0]?.[1] as FormData;
    expect(actions.uploadObjectAction.mock.calls[0]?.[0]).toBe("logs-1");
    expect(form.get("key")).toBe("notes.txt");
    expect(form.get("file")).toBe(file);
    expect(screen.getByText("Stored notes.txt. This console cannot list objects.")).toBeTruthy();
    expect(nav.push).not.toHaveBeenCalled();
  });
});
