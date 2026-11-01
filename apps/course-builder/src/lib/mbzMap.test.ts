import { describe, expect, it } from "vitest";
import {
  buildManifest,
  encodeVfsText,
  extract,
  patchActivityXmlField,
  rebuildSequence,
  unescapeXmlEntities,
  vfsToMbz,
  type MbzVfs,
} from "@workspace/mbz-parser";
import { mapMbzToCourse } from "./mbzMap";

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Minimal Moodle-like VFS covering editable types + unsupported + subsection. */
function buildFixtureVfs(): MbzVfs {
  const vfs: MbzVfs = new Map();

  vfs.set(
    "moodle_backup.xml",
    utf8(`<?xml version="1.0"?>
<moodle_backup>
  <information>
    <name>backup</name>
    <moodle_release>4.5</moodle_release>
    <details>
      <original_course_fullname>Fixture Course</original_course_fullname>
      <original_course_shortname>fix</original_course_shortname>
      <original_course_format>topics</original_course_format>
    </details>
    <contents>
      <activities>
        <activity>
          <moduleid>10</moduleid>
          <modulename>page</modulename>
          <title>Welcome Page</title>
        </activity>
        <activity>
          <moduleid>11</moduleid>
          <modulename>forum</modulename>
          <title>Class Forum</title>
        </activity>
        <activity>
          <moduleid>12</moduleid>
          <modulename>label</modulename>
          <title>Intro Label</title>
        </activity>
        <activity>
          <moduleid>20</moduleid>
          <modulename>subsection</modulename>
          <title>Nested Folder</title>
        </activity>
        <activity>
          <moduleid>21</moduleid>
          <modulename>url</modulename>
          <title>External Link</title>
        </activity>
        <activity>
          <moduleid>30</moduleid>
          <modulename>resource</modulename>
          <title>PDF Handout</title>
        </activity>
      </activities>
    </contents>
  </information>
</moodle_backup>`)
  );

  vfs.set(
    "files.xml",
    utf8(`<?xml version="1.0"?>
<files>
  <file>
    <contenthash>aabbccddeeff00112233445566778899aabbccdd</contenthash>
    <filename>hero.png</filename>
    <mimetype>image/png</mimetype>
  </file>
</files>`)
  );
  vfs.set("files/aa/aabbccddeeff00112233445566778899aabbccdd", utf8("fakepng"));

  // Section 1: page, forum, label, subsection
  vfs.set(
    "sections/section_1/section.xml",
    utf8(`<?xml version="1.0"?>
<section id="1">
  <number>1</number>
  <name>Lesson One</name>
  <summary></summary>
  <sequence>10,11,12,20</sequence>
  <component>$@NULL@$</component>
  <itemid>$@NULL@$</itemid>
</section>`)
  );

  // Delegated section for subsection 20
  vfs.set(
    "sections/section_2/section.xml",
    utf8(`<?xml version="1.0"?>
<section id="2">
  <number>2</number>
  <name>Nested</name>
  <summary></summary>
  <sequence>21</sequence>
  <component>mod_subsection</component>
  <itemid>20</itemid>
</section>`)
  );

  // Section 3 top-level with resource
  vfs.set(
    "sections/section_3/section.xml",
    utf8(`<?xml version="1.0"?>
<section id="3">
  <number>3</number>
  <name>Lesson Two</name>
  <summary></summary>
  <sequence>30</sequence>
  <component>$@NULL@$</component>
  <itemid>$@NULL@$</itemid>
</section>`)
  );

  const pageHtml =
    "&lt;p&gt;Hello &lt;img src=&quot;@@PLUGINFILE@@/hero.png&quot; /&gt;&lt;/p&gt;";
  vfs.set(
    "activities/page_10/page.xml",
    utf8(`<?xml version="1.0"?><activity><page id="10"><name>Welcome Page</name><content>${pageHtml}</content></page></activity>`)
  );
  vfs.set(
    "activities/page_10/module.xml",
    utf8(`<?xml version="1.0"?><module id="10"><name>Welcome Page</name></module>`)
  );

  vfs.set(
    "activities/forum_11/forum.xml",
    utf8(`<?xml version="1.0"?><activity><forum id="11"><name>Class Forum</name><intro>x</intro></forum></activity>`)
  );
  vfs.set(
    "activities/forum_11/module.xml",
    utf8(`<?xml version="1.0"?><module id="11"><name>Class Forum</name></module>`)
  );

  vfs.set(
    "activities/label_12/label.xml",
    utf8(`<?xml version="1.0"?><activity><label id="12"><name>Intro Label</name><intro>&lt;p&gt;Label body&lt;/p&gt;</intro></label></activity>`)
  );
  vfs.set(
    "activities/label_12/module.xml",
    utf8(`<?xml version="1.0"?><module id="12"><name>Intro Label</name></module>`)
  );

  vfs.set(
    "activities/subsection_20/subsection.xml",
    utf8(`<?xml version="1.0"?><activity><subsection id="20"><name>Nested Folder</name></subsection></activity>`)
  );
  vfs.set(
    "activities/subsection_20/module.xml",
    utf8(`<?xml version="1.0"?><module id="20"><name>Nested Folder</name></module>`)
  );

  vfs.set(
    "activities/url_21/url.xml",
    utf8(`<?xml version="1.0"?><activity><url id="21"><name>External Link</name><externalurl>https://example.com</externalurl><intro>&lt;p&gt;Go&lt;/p&gt;</intro></url></activity>`)
  );
  vfs.set(
    "activities/url_21/module.xml",
    utf8(`<?xml version="1.0"?><module id="21"><name>External Link</name></module>`)
  );

  vfs.set(
    "activities/resource_30/resource.xml",
    utf8(`<?xml version="1.0"?><activity><resource id="30"><name>PDF Handout</name><intro>&lt;p&gt;Read me&lt;/p&gt;</intro></resource></activity>`)
  );
  vfs.set(
    "activities/resource_30/module.xml",
    utf8(`<?xml version="1.0"?><module id="30"><name>PDF Handout</name></module>`)
  );

  return vfs;
}

describe("mapMbzToCourse", () => {
  it("maps editable activities and preserves pluginfile tokens", () => {
    const vfs = buildFixtureVfs();
    const manifest = buildManifest(vfs, {
      name: "fixture.mbz",
      sha1: "abc",
      sizeBytes: 1,
    });
    const mapping = mapMbzToCourse(manifest, vfs);

    expect(mapping.courseTitle).toBe("Fixture Course");
    // Two CB sections (top-level) + binding-only delegated
    const cbSections = mapping.sections.filter((s) => !s.bindingOnly);
    expect(cbSections).toHaveLength(2);
    expect(mapping.sections.some((s) => s.bindingOnly)).toBe(true);

    const titles = mapping.pages.map((p) => p.title);
    expect(titles).toContain("Welcome Page");
    expect(titles).toContain("Intro Label");
    expect(titles).toContain("External Link");
    expect(titles).toContain("PDF Handout");
    expect(titles).not.toContain("Class Forum");
    expect(titles).not.toContain("Nested Folder");

    const page = mapping.pages.find((p) => p.title === "Welcome Page")!;
    // HTML is split: lone pluginfile image → banner/image component
    const media = page.components.find(
      (c) => c.type === "banner" || c.type === "image" || c.type === "text"
    )!;
    const urlOrHtml =
      (media.props.imageUrl as string | undefined) ||
      (media.props.html as string | undefined) ||
      "";
    expect(urlOrHtml).toContain("@@PLUGINFILE@@/hero.png");
    expect(urlOrHtml).not.toContain("mbz-blob:");

    const lessonOne = cbSections.find((s) => s.title === "Lesson One")!;
    expect(lessonOne.meta.originalSequence).toEqual(["10", "11", "12", "20"]);
    expect(lessonOne.meta.preservedCmids).toEqual(expect.arrayContaining(["11", "20"]));
  });

  it("preserves @@PLUGINFILE@@ after simulated editor patch roundtrip", () => {
    const original =
      '<p>Hello <img src="@@PLUGINFILE@@/hero.png" alt="h" /></p>';
    const xml = `<activity><page id="1"><content>${original
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")}</content></page></activity>`;
    // Editor "saves" same HTML with token intact
    const patched = patchActivityXmlField(xml, "content", original);
    expect(patched).toContain("@@PLUGINFILE@@/hero.png");
    // Unescape for display still has token
    const body = patched.match(/<content>([\s\S]*?)<\/content>/i)?.[1] ?? "";
    expect(unescapeXmlEntities(body)).toContain('src="@@PLUGINFILE@@/hero.png"');
  });
});

describe("fixture archive roundtrip", () => {
  it("extract → patch page → vfsToMbz → extract keeps structure and sequence slots", async () => {
    const vfs = buildFixtureVfs();
    const bytes = vfsToMbz(vfs, { format: "tgz" });
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const { vfs: again, archiveKind } = await extract(ab);
    expect(archiveKind).toBe("tgz");

    const pageXml = new TextDecoder().decode(again.get("activities/page_10/page.xml")!);
    const patched = patchActivityXmlField(
      pageXml,
      "content",
      '<p>Updated <img src="@@PLUGINFILE@@/hero.png" /></p>'
    );
    again.set("activities/page_10/page.xml", encodeVfsText(patched));

    const nextSeq = rebuildSequence({
      orderedEditableCmids: ["12", "10"],
      originalSequence: ["10", "11", "12", "20"],
      editableCmidSet: new Set(["10", "12"]),
    });
    expect(nextSeq).toEqual(["12", "11", "10", "20"]);

    const packed = vfsToMbz(again, { format: "tgz" });
    const packedAb = packed.buffer.slice(
      packed.byteOffset,
      packed.byteOffset + packed.byteLength
    ) as ArrayBuffer;
    const { vfs: finalVfs } = await extract(packedAb);
    const finalPage = new TextDecoder().decode(finalVfs.get("activities/page_10/page.xml")!);
    expect(unescapeXmlEntities(finalPage)).toContain("Updated");
    expect(finalPage).toContain("@@PLUGINFILE@@/hero.png");
    expect(finalVfs.has("activities/forum_11/forum.xml")).toBe(true);
  });
});
