import { describe, expect, it } from "vitest";
import { extractBearerToken } from "./server";
import { ADMIN_GROUP_SLUG, isAdminFromGroups, isPlatformToolId } from "./constants";

describe("extractBearerToken", () => {
  it("returns the token from a Bearer header", () => {
    expect(extractBearerToken("Bearer abc.def")).toBe("abc.def");
  });

  it("is case-insensitive on the scheme and trims the token", () => {
    expect(extractBearerToken("bearer   tok  ")).toBe("tok");
  });

  it("returns null for missing or malformed headers", () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Basic abc")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
  });
});

describe("platform constants", () => {
  it("recognizes known tool ids only", () => {
    expect(isPlatformToolId("course-builder")).toBe(true);
    expect(isPlatformToolId("not-a-tool")).toBe(false);
  });

  it("detects admin membership by group slug", () => {
    expect(isAdminFromGroups([{ slug: "other" }, { slug: ADMIN_GROUP_SLUG }])).toBe(true);
    expect(isAdminFromGroups([{ slug: "other" }])).toBe(false);
    expect(isAdminFromGroups([])).toBe(false);
  });
});
