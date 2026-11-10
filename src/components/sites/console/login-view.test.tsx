import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginView } from "@/components/sites/console/login-view";

vi.mock("@/app/actions/auth", () => ({ loginAction: vi.fn() }));

describe("LoginView branding", () => {
  it("shows the VWS logo and the AWS-compatible wording above the form", () => {
    render(<LoginView next="/compute/instances" expired={false} />);
    expect(screen.getByRole("img", { name: "VWS" })).toHaveAttribute("src", "/images/vws-logo.svg");
    expect(screen.getByText("AWS-compatible console")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in to the console" })).toBeInTheDocument();
  });

  it("keeps the orange Sign in button", () => {
    render(<LoginView next="/compute/instances" expired={false} />);
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveClass("bg-[#ff9900]");
  });
});
