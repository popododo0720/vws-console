import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { TopBar } from "@/components/sites/console/top-bar";

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn() }) }));

describe("TopBar account menu", () => {
  it("shows the signed-in user and account ID", () => {
    render(
      <ConsoleProvider identity={{ userName: "alice", accountId: "123456789012" }}>
        <TopBar onMenu={() => {}} />
      </ConsoleProvider>,
    );
    const button = screen.getByRole("button", { name: /alice/ });
    expect(button).toHaveTextContent("123456789012");
    expect(screen.queryByText("demo.operator")).toBeNull();
    fireEvent.click(button);
    expect(screen.getByRole("menuitem", { name: "Account 123456789012" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeTruthy();
  });

  it("shows a dash when no session is known", () => {
    render(
      <ConsoleProvider>
        <TopBar onMenu={() => {}} />
      </ConsoleProvider>,
    );
    expect(screen.getByRole("button", { name: /—/ })).toHaveTextContent("——");
  });
});
