import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

type Braces = {
  (pattern: string, options?: { expand?: boolean; maxDepth?: number }): string[];
  compile(pattern: string): string;
  expand(pattern: string): string[];
};

type Micromatch = {
  isMatch(value: string, pattern: string): boolean;
};

const braces = require("braces") as Braces;
const micromatch = require("micromatch") as Micromatch;

function nested(depth: number): string {
  return `${"{".repeat(depth)}a${"}".repeat(depth)}`;
}

describe("braces override", () => {
  it("expands ordinary patterns the same way on every call", () => {
    const compiled = braces.compile("a/{b,c}/d");
    expect(compiled).toBe("a/(b|c)/d");
    expect(braces.compile("a/{b,c}/d")).toBe(compiled);
    expect(braces("a/{b,c}/d")).toEqual(["a/(b|c)/d"]);
    expect(braces.expand("a/{b,c}/d")).toEqual(["a/b/d", "a/c/d"]);
    expect(braces.expand("{1..3}")).toEqual(["1", "2", "3"]);
    expect(braces("ab")).toEqual(["ab"]);
    expect(braces("")).toEqual([""]);
  });

  it("rejects brace nesting past the depth cap instead of overflowing the stack", () => {
    expect(braces(nested(100))).toEqual([braces.compile(nested(100))]);
    expect(() => braces(nested(101))).toThrow(SyntaxError);
    expect(() => braces(nested(101))).toThrow(SyntaxError);
    expect(() => braces(nested(3), { maxDepth: 2 })).toThrow(SyntaxError);
    expect(braces(nested(2), { maxDepth: 2 }).length).toBeGreaterThan(0);
  });

  it("still lets micromatch expand a brace pattern", () => {
    expect(micromatch.isMatch("foo/a/bar", "foo/{a,b}/bar")).toBe(true);
    expect(micromatch.isMatch("foo/c/bar", "foo/{a,b}/bar")).toBe(false);
  });
});
