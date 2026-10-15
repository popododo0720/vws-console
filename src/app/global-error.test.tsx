import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlobalError from "@/app/global-error";

describe("global error boundary", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it("renders code and request ID only and reports with the root-layout context", () => {
    const error = Object.assign(new Error("layout secret"), { code: "InternalError", requestId: "req-root" });
    render(<GlobalError error={error} reset={() => {}} />, { container: document });
    expect(screen.getByText("req-root")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("layout secret");
    expect(consoleError).toHaveBeenCalledWith("[vws-console]", expect.objectContaining({ context: "root-layout" }));
  });
});
