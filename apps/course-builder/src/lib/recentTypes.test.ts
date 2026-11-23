import { afterEach, describe, expect, it, vi } from "vitest";

// Fresh module per test so the in-memory recent list starts empty.
async function load() {
  vi.resetModules();
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  return import("./componentCatalog");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recently used component types", () => {
  it("keeps newest first, without duplicates, capped at 5", async () => {
    const { pushRecent, readRecent } = await load();
    for (const t of ["text", "video", "image", "button", "forum", "video", "banner"] as const) {
      pushRecent(t);
    }
    expect(readRecent()).toEqual(["banner", "video", "forum", "button", "image"]);
  });

  it("notifies subscribers on every add and returns a new snapshot", async () => {
    const { pushRecent, readRecent, subscribeRecent } = await load();
    const before = readRecent();
    const listener = vi.fn();
    const unsubscribe = subscribeRecent(listener);
    pushRecent("text");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(readRecent()).not.toBe(before);
    expect(readRecent()).toBe(readRecent()); // stable until the next change
    unsubscribe();
    pushRecent("video");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("pads empty recent with POPULAR so the quick bar always has 5", async () => {
    const { resolveQuickRecent, POPULAR } = await load();
    expect(resolveQuickRecent([])).toEqual(POPULAR.slice(0, 5));
  });

  it("keeps real recent first and fills remaining slots from POPULAR", async () => {
    const { resolveQuickRecent, POPULAR } = await load();
    expect(resolveQuickRecent(["forum", "banner"])).toEqual([
      "forum",
      "banner",
      ...POPULAR.filter((t) => t !== "forum" && t !== "banner").slice(0, 3),
    ]);
  });
});

describe("recently used templates", () => {
  it("keeps newest first, without duplicates, capped at 5", async () => {
    const { pushRecentTemplate, readRecentTemplateIds } = await load();
    for (const id of ["a", "b", "c", "d", "e", "b", "f"]) {
      pushRecentTemplate(id);
    }
    expect(readRecentTemplateIds()).toEqual(["f", "b", "e", "d", "c"]);
  });

  it("resolves known templates and skips missing ids", async () => {
    const { resolveRecentTemplates, TEMPLATES } = await load();
    const known = TEMPLATES.slice(0, 2);
    expect(
      resolveRecentTemplates(
        ["missing", known[1].id, known[0].id, "also-missing"],
        known,
      ).map((t) => t.id),
    ).toEqual([known[1].id, known[0].id]);
  });
});
