import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorPanel } from "@/components/sites/console/error-panel";

const apiError = Object.assign(new Error("secret internal detail"), {
  code: "InvalidVolume.NotFound",
  requestId: "req-abc",
});

describe("ErrorPanel", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it("shows the code and request ID but not the message or stack", () => {
    const { container } = render(<ErrorPanel error={apiError} context="test" reset={() => {}} />);
    expect(screen.getByText("InvalidVolume.NotFound")).toBeInTheDocument();
    expect(screen.getByText("req-abc")).toBeInTheDocument();
    expect(container.textContent).not.toContain("secret internal detail");
    expect(container.textContent).not.toContain(apiError.stack?.split("\n")[1]?.trim() ?? "at ");
  });

  it("shows a dash when there is no request ID", () => {
    render(<ErrorPanel error={new Error("x")} context="test" reset={() => {}} />);
    expect(screen.getByText("InternalError")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("calls reset from Try again", () => {
    const reset = vi.fn();
    render(<ErrorPanel error={apiError} context="test" reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("reports the error once with its context", () => {
    render(<ErrorPanel error={apiError} context="route" reset={() => {}} />);
    expect(consoleError).toHaveBeenCalledWith("[vws-console]", {
      context: "route",
      code: "InvalidVolume.NotFound",
      message: "secret internal detail",
      requestId: "req-abc",
    });
  });
});
