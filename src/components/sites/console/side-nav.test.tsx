import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SideNav } from "@/components/sites/console/side-nav";
import { computeNav, networkNav } from "@/lib/console-data";

vi.mock("next/navigation", () => ({
  usePathname: () => "/network/nat-gateways",
  useSearchParams: () => new URLSearchParams(),
}));

describe("SideNav for the VPC console", () => {
  it("links the VPC dashboard title to /network and NAT gateways to its list", () => {
    render(<SideNav tree={networkNav} />);
    expect(screen.getByRole("link", { name: "VPC dashboard" })).toHaveAttribute("href", "/network");
    const nat = screen.getByRole("link", { name: "NAT gateways" });
    expect(nat).toHaveAttribute("href", "/network/nat-gateways");
    expect(nat).toHaveClass("text-[#006ce0]");
  });

  it("names VWS Global View with an external-link icon and has no Carrier gateways", () => {
    render(<SideNav tree={networkNav} />);
    const globalView = screen.getByRole("button", { name: "VWS Global View" });
    expect(globalView.querySelector("svg")).not.toBeNull();
    expect(screen.queryByText("Global view")).not.toBeInTheDocument();
    expect(screen.queryByText("Carrier gateways")).not.toBeInTheDocument();
  });

  it("gives the EC2 tree's VWS Global View the same icon", () => {
    render(<SideNav tree={computeNav} />);
    const nav = within(screen.getByRole("navigation", { name: "EC2" }));
    expect(nav.getByRole("button", { name: "VWS Global View" }).querySelector("svg")).not.toBeNull();
  });
});
