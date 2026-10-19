import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveApiFile } from "./vercelApiPlugin";

describe("resolveApiFile", () => {
  let root = "";

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "dev-api-"));
    fs.mkdirSync(path.join(root, "api", "nested"), { recursive: true });
    fs.mkdirSync(path.join(root, "api", "_private"), { recursive: true });
    fs.writeFileSync(path.join(root, "api", "chat.ts"), "");
    fs.writeFileSync(path.join(root, "api", "auth-handoff.ts"), "");
    fs.writeFileSync(path.join(root, "api", "nested", "index.ts"), "");
    fs.writeFileSync(path.join(root, "api", "_private", "secret.ts"), "");
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("maps /api/<name> to api/<name>.ts", () => {
    expect(resolveApiFile(root, "/api/chat")).toBe("/api/chat.ts");
    expect(resolveApiFile(root, "/api/auth-handoff/")).toBe("/api/auth-handoff.ts");
  });

  it("falls back to api/<name>/index.ts", () => {
    expect(resolveApiFile(root, "/api/nested")).toBe("/api/nested/index.ts");
  });

  it("ignores unknown, private, and non-api paths", () => {
    expect(resolveApiFile(root, "/api/missing")).toBeNull();
    expect(resolveApiFile(root, "/api/_private/secret")).toBeNull();
    expect(resolveApiFile(root, "/api/../package")).toBeNull();
    expect(resolveApiFile(root, "/api")).toBeNull();
    expect(resolveApiFile(root, "/src/main.tsx")).toBeNull();
  });
});
