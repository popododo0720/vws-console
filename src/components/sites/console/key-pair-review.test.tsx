import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleProvider } from "@/components/sites/console/console-provider";
import { KeyPairCreateView } from "@/components/sites/console/key-pair-create";
import { KeyPairsView } from "@/components/sites/console/key-pairs-view";
import type { KeyPairId, KeyPairName, StoredKeyPair } from "@/lib/key-pair";

const createKeyPairAction = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => "/network/key-pairs",
  useRouter: () => ({ push, refresh: vi.fn() }),
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
  created: "",
};

const laptop: StoredKeyPair = {
  id: "key-89abcdef" as KeyPairId,
  name: "laptop" as KeyPairName,
  fingerprint: "fp",
  type: "ed25519",
  ownerId: "123456789012",
  created: "",
};

function renderPairs(keyPairs: StoredKeyPair[] = []) {
  return render(
    <ConsoleProvider>
      <KeyPairsView keyPairs={keyPairs} loadError={null} />
    </ConsoleProvider>,
  );
}

function renderCreate(mode: "generate" | "import") {
  return render(
    <ConsoleProvider>
      <KeyPairCreateView mode={mode} />
    </ConsoleProvider>,
  );
}

const nameField = () => screen.getByRole("textbox", { name: "Name" });
const submitButton = (name: string) => screen.getAllByRole("button", { name }).at(-1)!;

beforeEach(() => {
  localStorage.clear();
  createKeyPairAction.mockReset();
  push.mockReset();
});

describe("key pairs list", () => {
  it("shows the AWS columns, the Created time and the AWS empty state", () => {
    const { unmount } = renderPairs([{ ...web, created: "2026-11-01T09:30:00Z" }]);
    const headers = screen
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent?.trim())
      .filter(Boolean);
    expect(headers).toEqual(["Name", "Type", "Created", "Fingerprint", "ID"]);
    expect(screen.getByText("2026/11/01 09:30 GMT+0")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Filter Key Pair by attribute or tag" })).toBeTruthy();
    unmount();
    renderPairs([]);
    expect(screen.getByText("No key pairs to display")).toBeTruthy();
  });

  it("shows a dash when console-api sends no createTime", () => {
    renderPairs([web]);
    const row = screen.getAllByRole("row").find((item) => item.textContent?.includes("key-01234567"))!;
    expect(
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toContain("—");
  });

  it("opens the Create key pair page and links Import key pair", () => {
    renderPairs([]);
    fireEvent.click(screen.getByRole("button", { name: "Create key pair" }));
    expect(push).toHaveBeenCalledWith("/network/key-pairs/create");
    fireEvent.click(screen.getByRole("button", { name: /Actions/ }));
    expect(screen.getByRole("menuitem", { name: "Import key pair" }).getAttribute("href")).toBe(
      "/network/key-pairs/import",
    );
  });
});

describe("key pair create recovery", () => {
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

  it("drops the warning when the last pending name is dismissed", () => {
    localStorage.setItem("vws.key-pair-pending-names", JSON.stringify(["web"]));
    renderPairs([web]);
    expect(screen.getByRole("status").textContent).toContain("The private key for web cannot be shown again.");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(localStorage.getItem("vws.key-pair-pending-names")).toBeNull();
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
});

describe("Create key pair page", () => {
  it("shows the AWS form and sends the chosen type and format", async () => {
    createKeyPairAction.mockResolvedValue({
      status: "ready",
      issued: { keyPair: web, privateKey: null, settlement: "succeeded" },
    });
    renderCreate("generate");
    expect(screen.getByRole("heading", { name: "Create key pair" })).toBeTruthy();
    expect(screen.getByText("Key pair type")).toBeTruthy();
    expect(screen.getByText("Private key file format")).toBeTruthy();
    expect(screen.getByText("No tags associated with the resource.")).toBeTruthy();
    expect((screen.getByRole("radio", { name: "RSA" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.change(nameField(), { target: { value: "web" } });
    fireEvent.click(screen.getByRole("radio", { name: "ED25519" }));
    fireEvent.click(screen.getByRole("radio", { name: /\.ppk/ }));
    fireEvent.click(submitButton("Create key pair"));
    await waitFor(() => expect(createKeyPairAction).toHaveBeenCalledTimes(1));
    expect(JSON.parse(createKeyPairAction.mock.calls[0][0].body)).toEqual({
      keyName: "web",
      keyType: "ed25519",
      keyFormat: "ppk",
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/network/key-pairs"));
  });

  it("sends one create for a double click", async () => {
    let resolve: (value: unknown) => void = () => {};
    createKeyPairAction.mockReturnValue(new Promise((done) => (resolve = done)));
    renderCreate("generate");
    fireEvent.change(nameField(), { target: { value: "web" } });
    const submit = submitButton("Create key pair");
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(createKeyPairAction).toHaveBeenCalledTimes(1);
    resolve({ status: "ready", issued: { keyPair: web, privateKey: null, settlement: "succeeded" } });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/network/key-pairs"));
  });

  it("rejects a name with a trailing space without calling the server", () => {
    renderCreate("generate");
    fireEvent.change(nameField(), { target: { value: "web " } });
    fireEvent.click(submitButton("Create key pair"));
    expect(screen.getByRole("alert").textContent).toBe(
      "Enter a key pair name of 1 to 255 ASCII characters. It cannot start or end with a space.",
    );
    expect(createKeyPairAction).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("returns to the list on Cancel without a request", () => {
    renderCreate("generate");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(push).toHaveBeenCalledWith("/network/key-pairs");
    expect(createKeyPairAction).not.toHaveBeenCalled();
  });

  it("keeps the user on the page until the private key dialog is closed", async () => {
    createKeyPairAction.mockResolvedValue({
      status: "ready",
      issued: {
        keyPair: web,
        privateKey: { fileName: "web.pem", material: "SECRET", format: "pem" },
        settlement: "succeeded",
      },
    });
    renderCreate("generate");
    fireEvent.change(nameField(), { target: { value: "web" } });
    fireEvent.click(submitButton("Create key pair"));
    const download = await screen.findByRole("dialog", { name: "Download private key" });
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(within(download).getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(push).toHaveBeenCalledWith("/network/key-pairs");
  });

  it("shows a retryable error when the server action rejects", async () => {
    createKeyPairAction.mockRejectedValue(new Error("network down"));
    renderCreate("generate");
    fireEvent.change(nameField(), { target: { value: "web" } });
    fireEvent.click(submitButton("Create key pair"));
    await screen.findByText("The key pair request did not reach the server. Retry from this dialog, or discard it.");
    const failure = screen.getByRole("dialog", { name: "Create key pair" });
    expect(within(failure).getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(within(failure).getByRole("button", { name: "Discard" })).toBeTruthy();
    expect(JSON.stringify(localStorage)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    expect(JSON.stringify(localStorage)).toContain("web");
    expect(createKeyPairAction).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("retries with the same idempotency key", async () => {
    createKeyPairAction.mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce({
      status: "ready",
      issued: { keyPair: web, privateKey: null, settlement: "succeeded" },
    });
    renderCreate("generate");
    fireEvent.change(nameField(), { target: { value: "web" } });
    fireEvent.click(submitButton("Create key pair"));
    await screen.findByRole("button", { name: "Retry" });
    const failure = screen.getByRole("dialog", { name: "Create key pair" });
    fireEvent.click(within(failure).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(createKeyPairAction).toHaveBeenCalledTimes(2));
    const [first, second] = createKeyPairAction.mock.calls.map(([attempt]) => attempt);
    expect(second).toEqual(first);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/network/key-pairs"));
  });

  it("guides the user after a duplicate create returns 409", async () => {
    createKeyPairAction.mockResolvedValue({
      status: "failed",
      error: { code: "AlreadyExists", message: "The keypair 'web' already exists.", requestId: "r-9" },
      issued: null,
    });
    renderCreate("generate");
    fireEvent.change(nameField(), { target: { value: "web" } });
    fireEvent.click(submitButton("Create key pair"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "The key pair 'web' already exists. Its private key cannot be downloaded again. Delete the key pair, then create a new one.",
    );
  });
});

describe("Import key pair page", () => {
  it("imports a pasted public key and leaves no recovery warning", async () => {
    createKeyPairAction.mockResolvedValue({
      status: "ready",
      issued: { keyPair: laptop, privateKey: null, settlement: "succeeded" },
    });
    const view = renderCreate("import");
    expect(screen.getByRole("heading", { name: "Import key pair" })).toBeTruthy();
    fireEvent.change(nameField(), { target: { value: "laptop" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Public key contents" }), {
      target: { value: "ssh-ed25519 AAAA laptop" },
    });
    fireEvent.click(submitButton("Import key pair"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/network/key-pairs"));
    view.unmount();
    renderPairs([laptop]);
    expect(screen.queryByText(/cannot be shown again/)).toBeNull();
    expect(screen.queryByText(/did not finish/)).toBeNull();
  });

  it("imports the contents of a public key file chosen before the name", async () => {
    createKeyPairAction.mockResolvedValue({
      status: "ready",
      issued: { keyPair: laptop, privateKey: null, settlement: "succeeded" },
    });
    renderCreate("import");
    const publicKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILaptop laptop";
    const file = new File([publicKey], "laptop.pub", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Browse"), { target: { files: [file] } });
    await waitFor(() =>
      expect((screen.getByRole("textbox", { name: "Public key contents" }) as HTMLTextAreaElement).value).toBe(
        publicKey,
      ),
    );
    fireEvent.change(nameField(), { target: { value: "laptop" } });
    fireEvent.click(submitButton("Import key pair"));
    await waitFor(() => expect(createKeyPairAction).toHaveBeenCalledTimes(1));
    expect(JSON.parse(createKeyPairAction.mock.calls[0][0].body)).toEqual({
      keyName: "laptop",
      publicKeyMaterial: publicKey,
    });
  });

  it("rejects a private key file before persistence", async () => {
    renderCreate("import");
    const secret = "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----";
    const file = new File([secret], "laptop.pem", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Browse"), { target: { files: [file] } });
    await screen.findByText("Enter a public key. A private key is not accepted.");
    expect(document.body.textContent).not.toContain("AAAA");
    expect(JSON.stringify(localStorage)).not.toContain("PRIVATE KEY");
    expect(JSON.stringify(localStorage)).not.toContain("AAAA");
  });
});
