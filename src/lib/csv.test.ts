import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("quotes cells that hold commas, quotes or line breaks", () => {
    expect(
      toCsv([
        ["id", "description"],
        ["sg-1", 'web, "public"'],
        ["sg-2", "plain"],
      ]),
    ).toBe('id,description\r\nsg-1,"web, ""public"""\r\nsg-2,plain');
  });
});
