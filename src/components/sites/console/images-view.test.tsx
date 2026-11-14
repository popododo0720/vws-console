import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { ImagesView } from "@/components/sites/console/images-view";
import type { ApiError, Image } from "@/lib/vws-api/adapter";

const nav = vi.hoisted(() => ({ refresh: vi.fn(), search: "" }));

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: nav.refresh, push: vi.fn() }),
  usePathname: () => "/compute/images",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

beforeEach(() => {
  nav.search = "";
});

const debian: Image = {
  id: "ami-0123456789abcdef0",
  name: "debian-12",
  state: "available",
  owner: "123456789012",
  architecture: "x86_64",
  creationDate: "2026-11-14T09:30:00.000Z",
  region: "pve-lab-2",
};
const ubuntu: Image = { ...debian, id: "ami-0fedcba9876543210", name: "ubuntu-24", state: "pending" };

function renderImages(images: Image[], loadError: ApiError | null = null) {
  render(
    <ConsoleProvider>
      <ImagesView images={images} loadError={loadError} />
    </ConsoleProvider>,
  );
}

const headers = () =>
  within(screen.getByRole("table"))
    .getAllByRole("columnheader")
    .slice(1)
    .map((header) => header.textContent);

const cellsOf = (id: string) =>
  within(screen.getByRole("row", { name: new RegExp(id) }))
    .getAllByRole("cell")
    .slice(1)
    .map((cell) => cell.textContent);

describe("ImagesView", () => {
  it("lists the images under the AWS column names, with the creation date as EC2 writes it", () => {
    renderImages([debian, ubuntu]);
    expect(screen.getByRole("heading", { level: 1, name: "Amazon Machine Images (AMIs)" })).toBeInTheDocument();
    expect(headers()).toEqual(["AMI name", "AMI ID", "Owner", "Status", "Architecture", "Creation date"]);
    expect(cellsOf(debian.id)).toEqual([
      "debian-12",
      "ami-0123456789abcdef0",
      "123456789012",
      "Available",
      "x86_64",
      "2026/11/14 09:30 GMT+0",
    ]);
    expect(cellsOf(ubuntu.id)[3]).toBe("Pending");
  });

  it("adds a Region column after the AMI name under All regions", () => {
    nav.search = "region=all";
    renderImages([debian, { ...ubuntu, region: "ap-northeast-2" }]);
    expect(headers().slice(0, 3)).toEqual(["AMI name", "Region", "AMI ID"]);
    expect([cellsOf(debian.id)[1], cellsOf(ubuntu.id)[1]]).toEqual(["pve-lab-2", "ap-northeast-2"]);
  });

  it("shows a dash for every value console-api left out and keeps a date it cannot read as sent", () => {
    renderImages([
      { id: "ami-1", name: "", state: "", owner: "", architecture: "", creationDate: "", region: "" },
      { ...debian, id: "ami-2", creationDate: "last week" },
    ]);
    expect(cellsOf("ami-1")).toEqual(["—", "ami-1", "—", "—", "—", "—"]);
    expect(cellsOf("ami-2")[5]).toBe("last week");
  });

  it("says the Region has no AMIs when the list is empty", () => {
    renderImages([]);
    expect(screen.getByText("No AMIs in this Region")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("shows the API error, and neither rows nor the empty text, when the list could not be loaded", () => {
    renderImages([], { code: "Unavailable", message: "region unavailable", requestId: "req-208" });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("AMIs could not be loaded");
    expect(alert).toHaveTextContent("region unavailable");
    expect(alert).toHaveTextContent("Unavailable · Request ID req-208");
    expect(screen.queryByText("No AMIs in this Region")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("reloads the list from Refresh, offers no Actions menu, and is opened by the sidebar's AMIs entry", () => {
    renderImages([debian]);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AMIs" })).toHaveAttribute("href", "/compute/images");
  });
});
