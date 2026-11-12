/**
 * Integration: map lesson 1 from the local racism course MBZ when present.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildManifest, extract, getTopLevelSections } from "@workspace/mbz-parser";
import { mapMbzToCourse } from "./mbzMap";

const MBZ_PATH =
  "c:/Users/amirg/Downloads/backup-moodle2-course-609102001-0609102001_-_מהי_גזענות__היסטוריה,_תאוריה_ומאבק-20261101-1448-nu.mbz";

describe("lesson 1 MBZ mapping (local file)", () => {
  it("imports pages, hvp questions, and board for שיעור 1 | מבוא", async () => {
    if (!existsSync(MBZ_PATH)) return;

    const buf = readFileSync(MBZ_PATH);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { vfs } = await extract(ab);
    const manifest = buildManifest(vfs, {
      name: "local.mbz",
      sha1: "local",
      sizeBytes: buf.length,
    });
    const mapping = mapMbzToCourse(manifest, vfs);
    const lesson = mapping.sections.find((s) => s.title.includes("שיעור 1"));
    expect(lesson).toBeTruthy();

    const pages = mapping.pages.filter((p) => p.sectionTempKey === lesson!.tempKey);
    const byType = pages.reduce<Record<string, number>>((acc, p) => {
      acc[p.binding.modtype] = (acc[p.binding.modtype] ?? 0) + 1;
      return acc;
    }, {});

    expect(byType.page).toBe(3);
    expect(byType.hvp).toBe(7);
    expect(byType.board).toBe(1);
    expect(byType.label).toBe(1);

    const board = pages.find((p) => p.binding.modtype === "board")!;
    expect(board.components.some((c) => c.type === "notes_board")).toBe(true);

    const hakdama = pages.find((p) => p.title === "הקדמה")!;
    expect(hakdama.components.some((c) => c.type === "banner")).toBe(true);
    expect(hakdama.components.some((c) => c.type === "video")).toBe(true);
    expect(hakdama.components.some((c) => c.type === "text")).toBe(true);

    // Nearly every Moodle page starts with a banner image — count across full course
    const contentPages = mapping.pages.filter((p) => p.binding.modtype === "page");
    const withBanner = contentPages.filter((p) => p.components.some((c) => c.type === "banner"));
    expect(withBanner.length / contentPages.length).toBeGreaterThan(0.85);

    const hvpWithQuestions = pages.filter(
      (p) => p.binding.modtype === "hvp" && p.components.some((c) => c.type === "question")
    );
    expect(hvpWithQuestions.length).toBeGreaterThanOrEqual(4);

    // Ensure top-level section list still parses
    expect(getTopLevelSections(manifest).length).toBeGreaterThan(1);
  }, 180_000);
});
