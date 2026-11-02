import { describe, expect, it } from "vitest";
import type { MbzManifest } from "@workspace/mbz-parser";
import {
  buildPluginfileUrlMap,
  remapHtmlPluginfileUrls,
  remapUrlToPluginfileToken,
  resolveMediaUrlForDisplay,
  resolvePluginfileHtml,
  resolvePluginfileToken,
} from "./mbzPluginfileUrls";

function manifest(partial: Partial<MbzManifest["course"]> & { files?: MbzManifest["files"] }): MbzManifest {
  return {
    sourceFile: { name: "t.mbz", sha1: "x", sizeBytes: 1 },
    course: {
      fullname: "T",
      shortname: "t",
      format: "topics",
      moodleVersion: "4.5",
      wwwroot: "https://moodle.tau.ac.il/2025",
      backupSettings: { includesUsers: false, anonymized: false },
      ...partial,
    },
    sections: [],
    activities: [],
    files: partial.files ?? [],
    warnings: [],
  };
}

describe("buildPluginfileUrlMap / resolve", () => {
  const files = [
    {
      hash: "abc",
      originalFilename: "banner.png",
      mimetype: "image/png",
      bucketPath: "files/ab/abc",
      contextid: "10",
      component: "mod_page",
      filearea: "content",
      itemid: "0",
      filepath: "/",
    },
  ];

  it("resolves @@PLUGINFILE@@ tokens to Moodle https URLs", () => {
    const map = buildPluginfileUrlMap(manifest({ files }));
    expect(map.byFilename["banner.png"]).toContain(
      "https://moodle.tau.ac.il/2025/pluginfile.php/10/mod_page/content/0/banner.png"
    );
    expect(resolvePluginfileToken("@@PLUGINFILE@@/banner.png", map)).toBe(
      map.byFilename["banner.png"]
    );
    expect(resolveMediaUrlForDisplay("@@PLUGINFILE@@/banner.png", map)).toBe(
      map.byFilename["banner.png"]
    );
    expect(resolveMediaUrlForDisplay("https://cdn.example/x.png", map)).toBe(
      "https://cdn.example/x.png"
    );
  });

  it("rewrites PLUGINFILE src attributes in HTML", () => {
    const map = buildPluginfileUrlMap(manifest({ files }));
    const html = `<p><img src="@@PLUGINFILE@@/banner.png" alt="x"></p>`;
    const out = resolvePluginfileHtml(html, map);
    expect(out).toContain(map.byFilename["banner.png"]);
    expect(out).not.toContain("@@PLUGINFILE@@");
  });

  it("prefers mod_page/content over user/draft for the same filename", () => {
    const map = buildPluginfileUrlMap(
      manifest({
        files: [
          {
            hash: "d1",
            originalFilename: "Frame 12 (1).png",
            mimetype: "image/png",
            bucketPath: "files/d1/d1",
            contextid: "99",
            component: "user",
            filearea: "draft",
            itemid: "771981965",
            filepath: "/",
          },
          {
            hash: "c1",
            originalFilename: "Frame 12 (1).png",
            mimetype: "image/png",
            bucketPath: "files/c1/c1",
            contextid: "42",
            component: "mod_page",
            filearea: "content",
            itemid: "0",
            filepath: "/",
          },
        ],
      })
    );
    const url = map.byFilename["Frame 12 (1).png"];
    expect(url).toContain("/pluginfile.php/42/mod_page/content/0/");
    expect(url).not.toContain("/user/draft/");
    expect(
      resolveMediaUrlForDisplay("@@PLUGINFILE@@/Frame%2012%20%281%29.png", map)
    ).toBe(url);
  });

  it("rewrites draftfile.php https URLs to stable pluginfile when mapped", () => {
    const map = buildPluginfileUrlMap(manifest({ files }));
    const draft =
      "https://moodle.tau.ac.il/2025/draftfile.php/38677/user/draft/771981965/banner.png";
    expect(resolveMediaUrlForDisplay(draft, map)).toBe(map.byFilename["banner.png"]);
  });
});

describe("export remap", () => {
  it("maps known Moodle URLs back to @@PLUGINFILE@@ and keeps overrides", () => {
    const moodleUrl =
      "https://moodle.tau.ac.il/2025/pluginfile.php/10/mod_page/content/0/banner.png";
    const map = {
      byFilename: { "banner.png": moodleUrl },
      byUrl: { [moodleUrl]: "banner.png" },
      wwwroot: "https://moodle.tau.ac.il/2025",
    };
    expect(remapUrlToPluginfileToken(moodleUrl, map)).toBe("@@PLUGINFILE@@/banner.png");
    expect(remapUrlToPluginfileToken("https://sharepoint.example/a.png", map)).toBe(
      "https://sharepoint.example/a.png"
    );

    const html = `<img src="${moodleUrl}"><img src="https://sharepoint.example/a.png">`;
    const remapped = remapHtmlPluginfileUrls(html, map);
    expect(remapped).toContain('src="@@PLUGINFILE@@/banner.png"');
    expect(remapped).toContain("https://sharepoint.example/a.png");
  });
});
