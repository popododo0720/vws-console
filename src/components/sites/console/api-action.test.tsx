import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function Probe({ action, onDone }: { action: () => Promise<null>; onDone: () => void }) {
  const api = useApiAction();
  return (
    <>
      <button onClick={() => api.run(action, onDone)}>Run</button>
      <ApiErrorAlert error={api.error} title="The action failed" />
    </>
  );
}

describe("useApiAction", () => {
  it("shows an unreachable error instead of crashing when the server action rejects", async () => {
    const onDone = vi.fn();
    render(<Probe action={() => Promise.reject(new TypeError("Failed to fetch"))} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(
      await screen.findByText("The request did not reach the server. Check your connection and try again."),
    ).toBeTruthy();
    expect(screen.getByText(/Unavailable/)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
  });
});
