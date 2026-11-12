import { afterEach, describe, expect, it, vi } from "vitest";
import { embedTexts } from "./embedCore";

vi.mock("openai", () => ({
  default: class {
    embeddings = {
      create: async () => {
        throw Object.assign(new Error("Incorrect API key provided: sk-proj-***tnQA"), {
          status: 401,
          code: "invalid_api_key",
        });
      },
    };
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("embedTexts", () => {
  it("hides OpenAI's error text and logs only status and code", async () => {
    vi.stubEnv("OPENAI_API_KEY", "bad-key");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const failure = await embedTexts(["שאלה"]).catch((err: Error) => err);

    expect(failure).toMatchObject({
      statusCode: 502,
      message: "AI service is temporarily unavailable",
    });
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain("invalid_api_key");
    expect(logged).not.toContain("sk-proj");
  });
});
