import { describe, expect, it } from "vitest";
import type { ServerResponse } from "node:http";
import { parseBody, parseQuery, toVercelResponse } from "./vercelAdapter";

describe("parseBody", () => {
  it("parses JSON bodies and keeps invalid JSON as the raw string", () => {
    expect(parseBody('{"a":1}', "application/json; charset=utf-8")).toEqual({ a: 1 });
    expect(parseBody("{oops", "application/json")).toBe("{oops");
  });

  it("returns undefined for empty bodies and strings for other types", () => {
    expect(parseBody("", "application/json")).toBeUndefined();
    expect(parseBody('{"a":1}', "text/plain;charset=UTF-8")).toBe('{"a":1}');
    expect(parseBody("x", undefined)).toBe("x");
  });

  it("parses urlencoded forms", () => {
    expect(parseBody("a=1&b=two", "application/x-www-form-urlencoded")).toEqual({
      a: "1",
      b: "two",
    });
  });
});

describe("parseQuery", () => {
  it("reads the query string and collects repeated keys into arrays", () => {
    expect(parseQuery("/api/admin?resource=users&id=1&id=2")).toEqual({
      resource: "users",
      id: ["1", "2"],
    });
    expect(parseQuery("/api/admin")).toEqual({});
    expect(parseQuery(undefined)).toEqual({});
  });
});

describe("toVercelResponse", () => {
  function fakeRes() {
    const state = { headers: {} as Record<string, string>, ended: undefined as unknown };
    const res = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        state.headers[name.toLowerCase()] = value;
      },
      end(body?: unknown) {
        state.ended = body ?? null;
      },
    };
    return { res: res as unknown as ServerResponse, state };
  }

  it("supports status().json() chaining", () => {
    const { res, state } = fakeRes();
    toVercelResponse(res).status(403).json({ error: "nope" });
    expect(res.statusCode).toBe(403);
    expect(state.headers["content-type"]).toContain("application/json");
    expect(state.ended).toBe('{"error":"nope"}');
  });

  it("send() writes strings as-is and objects as JSON", () => {
    const text = fakeRes();
    toVercelResponse(text.res).send("hi");
    expect(text.state.ended).toBe("hi");

    const obj = fakeRes();
    toVercelResponse(obj.res).send({ ok: true });
    expect(obj.state.ended).toBe('{"ok":true}');
  });
});
