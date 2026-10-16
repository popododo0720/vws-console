import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { MAX_OBJECT_BYTES } from "@/lib/object-upload";

const MULTIPART_FRAMING_BYTES = 64 * 1024;

describe("server action body limit", () => {
  it("accepts a 4 MiB object plus the multipart framing around it", () => {
    expect(nextConfig.serverActions?.bodySizeLimit).toBe(MAX_OBJECT_BYTES + MULTIPART_FRAMING_BYTES);
  });
});
