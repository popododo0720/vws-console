import { describe, expect, it } from "vitest";
import { normalizeClientError } from "@/lib/client-error";

describe("normalizeClientError", () => {
  it("reads EC2-style Code, Message and RequestId", () => {
    expect(
      normalizeClientError({
        Code: "InvalidInstanceID.NotFound",
        Message: "The instance ID 'i-0' does not exist",
        RequestId: "req-123",
      }),
    ).toEqual({
      code: "InvalidInstanceID.NotFound",
      message: "The instance ID 'i-0' does not exist",
      requestId: "req-123",
    });
  });

  it("reads camelCase code, message and requestId", () => {
    expect(normalizeClientError({ code: "Throttling", message: "Slow down", requestId: "req-9" })).toEqual({
      code: "Throttling",
      message: "Slow down",
      requestId: "req-9",
    });
  });

  it("maps a plain Error to InternalError with its message", () => {
    expect(normalizeClientError(new Error("boom"))).toEqual({
      code: "InternalError",
      message: "boom",
      requestId: null,
    });
  });

  it("maps null to InternalError", () => {
    expect(normalizeClientError(null)).toEqual({
      code: "InternalError",
      message: "Unknown error",
      requestId: null,
    });
  });

  it("keeps a string as the message", () => {
    expect(normalizeClientError("bad")).toEqual({
      code: "InternalError",
      message: "bad",
      requestId: null,
    });
  });

  it("maps malformed fields to InternalError", () => {
    expect(normalizeClientError({ Code: 42, Message: "", RequestId: "  " })).toEqual({
      code: "InternalError",
      message: "Unknown error",
      requestId: null,
    });
  });
});
