import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { CreateBucketView } from "@/components/sites/console/create-bucket-view";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
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
  fireEvent.click(screen.getByRole("button", { name: /—/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Show sample data" }));
}

describe("CreateBucketView", () => {
  beforeEach(() => push.mockReset());

  it("shows the AWS already-owned error and stays on the page", () => {
    renderView();
    fireEvent.change(screen.getByPlaceholderText("my-bucket"), { target: { value: "vws-logs" } });
    fireEvent.click(screen.getByRole("button", { name: "Create bucket" }));

    expect(screen.getByRole("alert")).toHaveTextContent("BucketAlreadyOwnedByYou");
    expect(push).not.toHaveBeenCalled();
  });

  it("opens a newly created bucket", () => {
    renderView();
    fireEvent.change(screen.getByPlaceholderText("my-bucket"), { target: { value: "new-bucket" } });
    fireEvent.click(screen.getByRole("button", { name: "Create bucket" }));

    expect(push).toHaveBeenCalledWith("/storage/buckets/new-bucket");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
