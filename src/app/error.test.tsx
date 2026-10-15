import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RouteError from "@/app/error";

describe("route error boundary", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it("renders code and request ID only and reports with the route context", () => {
    const error = Object.assign(new Error("leaky message"), {
      Code: "UnauthorizedOperation",
      RequestId: "req-route",
      digest: "d1",
    });
    const { container } = render(<RouteError error={error} reset={() => {}} />);
    expect(screen.getByRole("heading", { name: "This page hit a problem" })).toBeInTheDocument();
    expect(screen.getByText("UnauthorizedOperation")).toBeInTheDocument();
    expect(screen.getByText("req-route")).toBeInTheDocument();
    expect(container.textContent).not.toContain("leaky message");
    expect(consoleError).toHaveBeenCalledWith("[vws-console]", expect.objectContaining({ context: "route" }));
  });
});
