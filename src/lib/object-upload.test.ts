import { describe, expect, it } from "vitest";
import { MAX_OBJECT_BYTES, fileProblem } from "@/lib/object-upload";

describe("fileProblem", () => {
  it("accepts files up to the cap, including empty ones", () => {
    expect(fileProblem({ size: 0 })).toBeNull();
    expect(fileProblem({ size: MAX_OBJECT_BYTES })).toBeNull();
  });

  it("refuses a file one byte over the cap with the 4 MiB message", () => {
    expect(fileProblem({ size: MAX_OBJECT_BYTES + 1 })).toEqual({
      code: "InvalidArgument",
      message: "Objects larger than 4 MiB cannot be uploaded.",
      requestId: null,
    });
  });
});
