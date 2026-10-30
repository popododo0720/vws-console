import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { CreateBucketView } from "@/components/sites/console/create-bucket-view";
import type { ApiError } from "@/lib/vws-api/adapter";

const { push, createBucketAction } = vi.hoisted(() => ({ push: vi.fn(), createBucketAction: vi.fn() }));

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/actions/resources", () => ({ createBucketAction }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/storage/buckets/create",
  useSearchParams: () => new URLSearchParams(),
}));

function renderView() {
  render(
    <ConsoleProvider>
      <CreateBucketView />
    </ConsoleProvider>,
  );
}

describe("CreateBucketView", () => {
  beforeEach(() => {
    push.mockReset();
    createBucketAction.mockReset();
    createBucketAction.mockResolvedValue(null);
  });

  it("shows that versioning, public access, and directory buckets are not applied", () => {
    renderView();
    expect(screen.getByRole("radio", { name: /Directory/ })).toBeDisabled();
    expect(screen.getByText("Directory buckets are not available.")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Disable" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Enable" })).toBeDisabled();
    expect(screen.getByText("Bucket versioning is not available. Creating a bucket does not enable it.")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Block all public access/ })).toBeDisabled();
    expect(screen.getByText("Block Public Access is not available. Creating a bucket does not apply it.")).toBeTruthy();
  });

  it("opens the new bucket when the action accepts the name", async () => {
    renderView();
    fireEvent.change(screen.getByPlaceholderText("my-bucket"), { target: { value: "new-bucket" } });
    fireEvent.click(screen.getByRole("button", { name: "Create bucket" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/storage/buckets/new-bucket"));
    expect(createBucketAction).toHaveBeenCalledWith("new-bucket");
  });

  it("shows the AWS already-owned error and stays on the page", async () => {
    createBucketAction.mockResolvedValue({
      code: "BucketAlreadyOwnedByYou",
      message: "Your previous request to create the named bucket succeeded and you already own it.",
      requestId: "r-1",
    } satisfies ApiError);
    renderView();
    fireEvent.change(screen.getByPlaceholderText("my-bucket"), { target: { value: "vws-logs" } });
    fireEvent.click(screen.getByRole("button", { name: "Create bucket" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("you already own it");
    expect(push).not.toHaveBeenCalled();
  });
});
