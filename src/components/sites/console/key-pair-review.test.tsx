import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { KeyPairsView } from "@/components/sites/console/key-pairs-view";
import type { KeyPairId, KeyPairName, StoredKeyPair } from "@/lib/key-pair";

const createKeyPairAction = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => "/network/key-pairs",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/actions/resources", () => ({
  createKeyPairAction,
  deleteKeyPairsAction: vi.fn(),
}));

const web: StoredKeyPair = {
  id: "key-01234567" as KeyPairId,
  name: "web" as KeyPairName,
  fingerprint: "fp",
  type: "rsa",
  ownerId: "123456789012",
};

function renderPairs(keyPairs: StoredKeyPair[] = []) {
  return render(
    <ConsoleProvider>
      <KeyPairsView keyPairs={keyPairs} loadError={null} />
    </ConsoleProvider>,
  );
}

describe("key pair create recovery", () => {
  beforeEach(() => {
    localStorage.clear();
    createKeyPairAction.mockReset();
  });

  it("shows that a created private key cannot be shown again", () => {
    localStorage.setItem("vws.key-pair-pending-names", JSON.stringify(["web"]));
    renderPairs([web]);
    expect(screen.getByRole("status").textContent).toContain("The private key for web cannot be shown again.");
  });

  it("says an interrupted create did not finish when the name is absent", () => {
    localStorage.setItem("vws.key-pair-pending-names", JSON.stringify(["missing"]));
    renderPairs([]);
    expect(screen.getByRole("status").textContent).toContain(
      "The create for missing did not finish. Create the key pair again if you still need it.",
    );
  });

  it("drops a stored idempotency receipt on load", () => {
    const secret = "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----";
    localStorage.setItem(
      "vws.key-pair-receipt.attempt-1",
      JSON.stringify({ keyName: "web", publicKeyMaterial: secret }),
    );
    renderPairs([]);
    expect(localStorage.getItem("vws.key-pair-receipt.attempt-1")).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain("PRIVATE KEY");
    expect(JSON.stringify(localStorage)).not.toContain("attempt-1");
  });

  it("shows a retryable error when the server action rejects", async () => {
    createKeyPairAction.mockRejectedValue(new Error("network down"));
    renderPairs([]);
    fireEvent.click(screen.getByRole("button", { name: "Create key pair" }));
    const dialog = screen.getByRole("dialog", { name: "Create key pair" });
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "web" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key pair" }));
    await screen.findByText("The key pair request did not reach the server. Retry from this dialog, or discard it.");
    const failure = screen.getByRole("dialog", { name: "Create key pair" });
    expect(within(failure).getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(within(failure).getByRole("button", { name: "Discard" })).toBeTruthy();
    expect(JSON.stringify(localStorage)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    expect(JSON.stringify(localStorage)).toContain("web");
    await waitFor(() => expect(createKeyPairAction).toHaveBeenCalledTimes(1));
  });

  it("does not warn about a lost private key after a successful import", async () => {
    const laptop: StoredKeyPair = {
      id: "key-89abcdef" as KeyPairId,
      name: "laptop" as KeyPairName,
      fingerprint: "fp",
      type: "ed25519",
      ownerId: "123456789012",
    };
    createKeyPairAction.mockResolvedValue({
      status: "ready",
      issued: { keyPair: laptop, privateKey: null, settlement: "succeeded" },
    });
    const view = renderPairs([]);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Import key pair" }));
    const dialog = screen.getByRole("dialog", { name: "Import key pair" });
    const fields = within(dialog).getAllByRole("textbox");
    fireEvent.change(fields[0], { target: { value: "laptop" } });
    fireEvent.change(fields[1], { target: { value: "ssh-ed25519 AAAA laptop" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Import key pair" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    view.rerender(
      <ConsoleProvider>
        <KeyPairsView keyPairs={[laptop]} loadError={null} />
      </ConsoleProvider>,
    );
    expect(screen.queryByText(/cannot be shown again/)).toBeNull();
    expect(screen.queryByText(/did not finish/)).toBeNull();
  });

  it("offers Browse and rejects a private key file before persistence", async () => {
    renderPairs([]);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Import key pair" }));
    const dialog = screen.getByRole("dialog", { name: "Import key pair" });
    const browse = within(dialog).getByLabelText("Browse");
    expect(browse).toBeInstanceOf(HTMLInputElement);
    const secret = "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----";
    const file = new File([secret], "laptop.pem", { type: "text/plain" });
    fireEvent.change(browse, { target: { files: [file] } });
    await waitFor(() => expect(dialog.textContent).toContain("Enter a public key. A private key is not accepted."));
    expect(dialog.textContent).not.toContain("AAAA");
    expect(JSON.stringify(localStorage)).not.toContain("PRIVATE KEY");
    expect(JSON.stringify(localStorage)).not.toContain("AAAA");
  });
});
