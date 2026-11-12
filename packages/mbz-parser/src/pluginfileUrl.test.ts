import { describe, expect, it } from "vitest";
import { buildMoodlePluginfileUrl } from "./parseStructure";

describe("buildMoodlePluginfileUrl", () => {
  it("builds a standard pluginfile URL", () => {
    const url = buildMoodlePluginfileUrl("https://moodle.tau.ac.il/2025/", {
      originalFilename: "באנר.png",
      contextid: "506102",
      component: "course",
      filearea: "section",
      itemid: "123",
      filepath: "/",
    });
    expect(url).toBe(
      "https://moodle.tau.ac.il/2025/pluginfile.php/506102/course/section/123/%D7%91%D7%90%D7%A0%D7%A8.png"
    );
  });

  it("returns null when wwwroot or metadata missing", () => {
    expect(
      buildMoodlePluginfileUrl(null, {
        originalFilename: "a.png",
        contextid: "1",
        component: "mod_page",
        filearea: "content",
        itemid: "0",
        filepath: "/",
      })
    ).toBeNull();
    expect(
      buildMoodlePluginfileUrl("https://moodle.example.com", {
        originalFilename: "a.png",
        contextid: null,
        component: "mod_page",
        filearea: "content",
        itemid: "0",
        filepath: "/",
      })
    ).toBeNull();
  });
});
