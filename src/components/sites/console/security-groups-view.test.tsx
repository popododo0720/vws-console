import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { SecurityGroupsView } from "@/components/sites/console/security-groups-view";
import type { SecurityGroup } from "@/types/console";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/app/actions/resources", () => ({ deleteSecurityGroupsAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => "/network/security-groups",
  useSearchParams: () => new URLSearchParams(),
}));

function group(id: string, groupName: string): SecurityGroup {
  return {
    id,
    name: groupName,
    groupName,
    vpcId: "vpc-12345678",
    description: "Allow web traffic",
    owner: "123456789012",
    region: "vws-1",
    rules: [],
  };
}

function renderGroups(rows: SecurityGroup[]) {
  render(
    <ConsoleProvider>
      <SecurityGroupsView securityGroups={rows} loadError={null} />
    </ConsoleProvider>,
  );
}

describe("SecurityGroupsView header parity", () => {
  it("reads the breadcrumb and title as Security Groups with no count", () => {
    renderGroups([group("sg-1", "default")]);
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(breadcrumb).getByText("Security Groups")).toBeTruthy();
    expect(breadcrumb.textContent).not.toMatch(/\(\d+\)/);
    expect(screen.getByRole("heading", { level: 1, name: "Security Groups" })).toBeTruthy();
  });

  it("puts Last updated and the only refresh button before Actions", () => {
    renderGroups([group("sg-1", "default")]);
    const lastUpdated = screen.getByText(/^Last updated/);
    const refreshButton = screen.getByRole("button", { name: "Refresh" });
    const actions = screen.getByRole("button", { name: "Actions" });
    expect(screen.getAllByRole("button", { name: "Refresh" })).toHaveLength(1);
    expect(lastUpdated.compareDocumentPosition(refreshButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(refreshButton.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(refreshButton);
    expect(refresh).toHaveBeenCalled();
  });

  it("does not render the Saved filter sets dropdown", () => {
    renderGroups([group("sg-1", "default")]);
    expect(screen.queryByText("Saved filter sets")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
