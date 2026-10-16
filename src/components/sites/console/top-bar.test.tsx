import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseBucketName } from "@/lib/vws-api/adapter";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { TopBar } from "@/components/sites/console/top-bar";

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn() }) }));

describe("TopBar account menu", () => {
  it("shows the signed-in user and account ID", () => {
    render(
      <ConsoleProvider identity={{ userName: "alice", accountId: "123456789012" }} signIn>
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

  it("offers no Sign out with IAM off", () => {
    render(
      <ConsoleProvider>
        <TopBar onMenu={() => {}} />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /—/ }));
    expect(screen.queryByRole("menuitem", { name: "Sign out" })).toBeNull();
  });

  it("links an account bucket to its page and ignores sample buckets", () => {
    const name = parseBucketName("logs-1");
    if (!name) throw new Error("logs-1");
    render(
      <ConsoleProvider accountBuckets={[{ name, ownerId: "1", created: "2026-08-02T00:00:00Z" }]}>
        <TopBar onMenu={() => {}} />
      </ConsoleProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /—/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Show sample data" }));
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "logs" } });
    expect(screen.getByRole("link", { name: /logs-1/ }).getAttribute("href")).toBe("/storage/buckets/logs-1");
    expect(screen.queryByRole("link", { name: /vws-logs/ })).toBeNull();
  });
});
