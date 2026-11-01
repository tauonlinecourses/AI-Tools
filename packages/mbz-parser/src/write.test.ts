import { describe, expect, it } from "vitest";
import { extract } from "./extract";
import {
  patchActivityXmlField,
  patchSectionName,
  patchSectionSequence,
  rebuildSequence,
  vfsToMbz,
} from "./write";
import type { MbzVfs } from "./types";

describe("rebuildSequence", () => {
  const editable = new Set(["10", "20", "30"]);

  it("keeps unsupported cmids in relative slots after reorder", () => {
    // original: page10, forum99, page20, page30
    const original = ["10", "99", "20", "30"];
    const ordered = ["30", "10", "20"]; // user reordered editables
    const next = rebuildSequence({
      orderedEditableCmids: ordered,
      originalSequence: original,
      editableCmidSet: editable,
    });
    expect(next).toEqual(["30", "99", "10", "20"]);
  });

  it("soft-omits deleted editable cmids", () => {
    const next = rebuildSequence({
      orderedEditableCmids: ["10", "20"],
      originalSequence: ["10", "99", "20", "30"],
      removedEditableCmids: ["30"],
      editableCmidSet: editable,
    });
    expect(next).toEqual(["10", "99", "20"]);
  });

  it("preserves subsection pointers among editables", () => {
    const next = rebuildSequence({
      orderedEditableCmids: ["20", "10"],
      originalSequence: ["10", "sub1", "20"],
      editableCmidSet: new Set(["10", "20"]),
    });
    expect(next).toEqual(["20", "sub1", "10"]);
  });
});

describe("XML patch helpers", () => {
  it("patches activity content field with escaped HTML", () => {
    const xml = `<activity><page id="1"><name>A</name><content>&lt;p&gt;old&lt;/p&gt;</content></page></activity>`;
    const patched = patchActivityXmlField(xml, "content", "<p>new & nice</p>");
    expect(patched).toContain("&lt;p&gt;new &amp; nice&lt;/p&gt;");
    expect(patched).toContain("<name>A</name>");
  });

  it("patches section name and sequence", () => {
    const xml = `<section><name>Old</name><sequence>1,2,3</sequence></section>`;
    expect(patchSectionName(xml, "New <x>")).toContain("<name>New &lt;x&gt;</name>");
    expect(patchSectionSequence(xml, ["9", "8"])).toContain("<sequence>9,8</sequence>");
  });
});

describe("vfsToMbz roundtrip", () => {
  it("repacks tgz and extracts the same paths", async () => {
    const vfs: MbzVfs = new Map([
      ["moodle_backup.xml", new TextEncoder().encode("<moodle_backup/>")],
      ["sections/section_1/section.xml", new TextEncoder().encode("<section><name>S</name><sequence>1</sequence></section>")],
    ]);
    const bytes = vfsToMbz(vfs, { format: "tgz" });
    expect(bytes[0]).toBe(0x1f);
    expect(bytes[1]).toBe(0x8b);

    const { vfs: again, archiveKind } = await extract(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    expect(archiveKind).toBe("tgz");
    expect(again.has("moodle_backup.xml")).toBe(true);
    expect(again.has("sections/section_1/section.xml")).toBe(true);
  });

  it("repacks zip", async () => {
    const vfs: MbzVfs = new Map([["moodle_backup.xml", new TextEncoder().encode("<x/>")]]);
    const bytes = vfsToMbz(vfs, { format: "zip" });
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const { archiveKind } = await extract(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    expect(archiveKind).toBe("zip");
  });
});
