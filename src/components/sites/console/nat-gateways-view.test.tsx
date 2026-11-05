import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsoleProvider, useConsole } from "@/components/sites/console/console-provider";
import { NatGatewaysView } from "@/components/sites/console/nat-gateways-view";

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/network/nat-gateways",
  useSearchParams: () => new URLSearchParams(),
}));

function UseSample() {
  const api = useConsole();
  return (
    <button type="button" onClick={api.showSample}>
      use sample data
    </button>
  );
}

function renderView() {
  render(
    <ConsoleProvider>
      <UseSample />
      <NatGatewaysView />
    </ConsoleProvider>,
  );
}

function showSample() {
  fireEvent.click(screen.getByRole("button", { name: "use sample data" }));
}

function choose(name: string) {
  const trigger = screen.getByRole("button", { name: "Actions" });
  if (trigger.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger);
  return screen.getByRole("menuitem", { name });
}

describe("NatGatewaysView", () => {
  it("shows the one-line empty state with the AWS chrome and no rows", () => {
    renderView();
    expect(screen.getByText("No NAT gateways found")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "NAT gateways (0)" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Find NAT gateways by attribute or tag" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Select a NAT gateway" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create NAT gateway" })).toBeInTheDocument();
  });

  it("lists the columns in the AWS order", () => {
    renderView();
    const headers = within(screen.getByRole("table"))
      .getAllByRole("columnheader")
      .slice(1)
      .map((header) => header.textContent);
    expect(headers).toEqual([
      "Name",
      "NAT gateway ID",
      "Connectivity type",
      "State",
      "State message",
      "Availability mode",
      "Route table ID",
      "Primary public IPv4 address",
      "Primary private IPv4 address",
      "Primary network interface ID",
      "VPC",
      "Subnet",
      "Created",
      "Deleted",
    ]);
  });

  it("shows a dash for a private gateway's missing public address and for an empty Deleted", () => {
    renderView();
    showSample();
    const row = screen.getByRole("row", { name: /nat-0b2c3d4e5f607182/ });
    const cells = within(row)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells[3]).toBe("Private");
    expect(cells[8]).toBe("—");
    expect(cells[cells.length - 1]).toBe("—");
  });

  it("disables Manage tags always and Delete until one available gateway is selected", () => {
    renderView();
    showSample();
    expect(choose("Delete NAT gateway")).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select nat-0a1b2c3d4e5f6071" }));
    expect(choose("Manage tags")).toBeDisabled();
    expect(choose("Delete NAT gateway")).toBeEnabled();
  });

  it("deletes only after the user types delete, and keeps the gateway listed as deleted", () => {
    renderView();
    showSample();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select nat-0a1b2c3d4e5f6071" }));
    fireEvent.click(choose("Delete NAT gateway"));
    const dialog = screen.getByRole("dialog", { name: "Delete NAT gateway" });
    const confirmButton = within(dialog).getByRole("button", { name: "Delete" });
    expect(confirmButton).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Confirm deletion" }), {
      target: { value: "delet" },
    });
    expect(confirmButton).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Confirm deletion" }), {
      target: { value: "delete" },
    });
    fireEvent.click(confirmButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const row = screen.getByRole("row", { name: /nat-0a1b2c3d4e5f6071/ });
    expect(within(row).getByText("Deleted", { selector: "td" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select nat-0a1b2c3d4e5f6071" }));
    expect(choose("Delete NAT gateway")).toBeDisabled();
  });

  it("shows the provider's error in the create dialog and creates once the subnet is chosen", () => {
    renderView();
    showSample();
    fireEvent.click(screen.getByRole("button", { name: "Create NAT gateway" }));
    const dialog = screen.getByRole("dialog", { name: "Create NAT gateway" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create NAT gateway" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/subnet/i);
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Subnet" }), {
      target: { value: "subnet-0a1b2c3d4e5f6071" },
    });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), { target: { value: "edge-nat" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Private" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create NAT gateway" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "NAT gateways (3)" })).toBeInTheDocument();
    expect(screen.getByText("edge-nat")).toBeInTheDocument();
  });
});
