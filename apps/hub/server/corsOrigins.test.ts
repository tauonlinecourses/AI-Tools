import { describe, expect, it } from "vitest";
import { tools } from "../src/tools.config";
import { TOOL_ORIGINS, allowedCorsOrigin } from "./corsOrigins";

describe("TOOL_ORIGINS", () => {
  it("matches every standalone tool url in tools.config", () => {
    const fromConfig = tools
      .filter((t) => t.url && !t.hubPath)
      .map((t) => new URL(t.url!).origin)
      .sort();
    expect([...TOOL_ORIGINS].sort()).toEqual(fromConfig);
  });
});

describe("allowedCorsOrigin", () => {
  const tool = "https://ai-tools-course-builder.vercel.app";

  it("echoes a known tool origin", () => {
    expect(allowedCorsOrigin(tool, "production")).toBe(tool);
  });

  it("rejects unknown and look-alike origins", () => {
    expect(allowedCorsOrigin("https://evil.example", "production")).toBeNull();
    expect(
      allowedCorsOrigin("https://ai-tools-evil.vercel.app", "production")
    ).toBeNull();
    expect(allowedCorsOrigin(`${tool}.evil.example`, "production")).toBeNull();
    expect(allowedCorsOrigin(undefined, "production")).toBeNull();
  });

  it("allows localhost only outside production", () => {
    expect(allowedCorsOrigin("http://localhost:5176", undefined)).toBe(
      "http://localhost:5176"
    );
    expect(allowedCorsOrigin("http://localhost:5176", "production")).toBeNull();
  });
});
