import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { Shell } from "@/components/sites/console/shell";

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/compute/instances",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("Shell branding", () => {
  it("puts the VWS logo first in the top bar", () => {
    render(
      <ConsoleProvider>
        <Shell tree={null}>
          <p>content</p>
        </Shell>
      </ConsoleProvider>,
    );
    const header = screen.getByRole("banner");
    const logo = within(header).getByRole("img", { name: "VWS" });
    expect(logo).toHaveAttribute("src", "/images/vws-logo.svg");
    expect(header.firstElementChild).toContainElement(logo);
    expect(header.firstElementChild).toHaveAttribute("href", "/compute/instances");
  });
});
