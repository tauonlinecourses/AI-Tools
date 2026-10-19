import { afterEach, describe, expect, it, vi } from "vitest";
import { handler } from "./server";

function post(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const oneMessage = [{ role: "user", content: "hi" }];

describe("ai-client handler validation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects non-POST requests", async () => {
    const res = await handler(new Request("http://localhost/api/chat"));
    expect(res.status).toBe(405);
  });

  it("rejects invalid JSON", async () => {
    const res = await handler(post("{not json"));
    expect(res.status).toBe(400);
  });

  it("rejects a missing messages array", async () => {
    const res = await handler(post({}));
    expect(res.status).toBe(400);
  });

  it("rejects an empty messages array", async () => {
    const res = await handler(post({ messages: [] }));
    expect(res.status).toBe(400);
  });

  it("rejects models outside the allowlist", async () => {
    const res = await handler(post({ messages: oneMessage, model: "gpt-3.5-turbo" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Model not allowed");
  });

  it("rejects too many messages", async () => {
    const messages = Array.from({ length: 41 }, () => ({ role: "user", content: "x" }));
    const res = await handler(post({ messages }));
    expect(res.status).toBe(413);
  });

  it("rejects a single oversized message", async () => {
    const res = await handler(
      post({ messages: [{ role: "user", content: "x".repeat(16_001) }] })
    );
    expect(res.status).toBe(413);
  });

  it("rejects non-string message content", async () => {
    const res = await handler(post({ messages: [{ role: "user", content: 42 }] }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when OPENAI_API_KEY is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const res = await handler(post({ messages: oneMessage }));
    expect(res.status).toBe(500);
  });
});
