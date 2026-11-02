import { describe, expect, it } from "vitest";
import { encodeVfsText, type MbzActivity, type MbzSection, type MbzVfs } from "@workspace/mbz-parser";
import {
  mapHomeSectionSummary,
  mapLearningmapToComponents,
  mapUnilabelToComponents,
} from "./mbzHomeMap";

function section(partial: Partial<MbzSection> & Pick<MbzSection, "summaryRaw">): MbzSection {
  return {
    id: "0",
    number: 0,
    name: "עמוד ראשי",
    summaryHtml: null,
    summaryStatus: "decoded",
    activityRefs: [],
    delegatedBy: null,
    ...partial,
  };
}

describe("mapHomeSectionSummary", () => {
  it("splits banner + text from section summary HTML", () => {
    const raw =
      "&lt;p&gt;&lt;img src=&quot;@@PLUGINFILE@@/banner.png&quot; alt=&quot;באנר הקורס&quot; width=&quot;1920&quot; height=&quot;420&quot;&gt;&lt;/p&gt;&lt;p&gt;ברוכים הבאים&lt;/p&gt;";
    const comps = mapHomeSectionSummary(section({ summaryRaw: raw }));
    expect(comps.map((c) => c.type)).toEqual(expect.arrayContaining(["banner", "text"]));
    expect(comps.some((c) => (c.props.imageUrl as string | undefined)?.includes("@@PLUGINFILE@@"))).toBe(
      true
    );
  });
});

describe("mapUnilabelToComponents", () => {
  it("maps grid tiles to buttons", () => {
    const vfs: MbzVfs = new Map();
    vfs.set(
      "activities/unilabel_1/unilabel.xml",
      encodeVfsText(`<?xml version="1.0"?>
<activity><unilabel id="1">
  <name>לינקים</name>
  <subplugin_unilabeltype_grid_unilabel>
    <unilabeltype_grid id="1">
      <unilabeltype_grid_tile id="1">
        <title>הודעות</title>
        <url>https://example.com/a</url>
      </unilabeltype_grid_tile>
      <unilabeltype_grid_tile id="2">
        <title>מדריך</title>
        <url>$@RESOURCEVIEWBYID*1@$</url>
      </unilabeltype_grid_tile>
    </unilabeltype_grid>
  </subplugin_unilabeltype_grid_unilabel>
</unilabel></activity>`)
    );
    const activity = {
      cmid: "1",
      type: "unilabel",
      name: "לינקים",
      activityDir: "activities/unilabel_1",
      rawXmlPath: "activities/unilabel_1/unilabel.xml",
    } as MbzActivity;
    const comps = mapUnilabelToComponents(vfs, activity);
    expect(comps).toHaveLength(2);
    expect(comps.every((c) => c.type === "button")).toBe(true);
    expect(comps[0]!.props.text).toBe("הודעות");
    expect(comps[0]!.props.url).toBe("https://example.com/a");
  });
});

describe("mapLearningmapToComponents", () => {
  it("extracts PLUGINFILE background as interactive_unit image", () => {
    const vfs: MbzVfs = new Map();
    vfs.set(
      "activities/learningmap_1/learningmap.xml",
      encodeVfsText(`<?xml version="1.0"?>
<activity><learningmap id="1">
  <name>מפת הקורס</name>
  <svgcode>&lt;svg&gt;&lt;image xlink:href="@@PLUGINFILE@@/%D7%9E%D7%A4%D7%AA.png" /&gt;&lt;/svg&gt;</svgcode>
</learningmap></activity>`)
    );
    const activity = {
      cmid: "1",
      type: "learningmap",
      name: "מפת הקורס",
      activityDir: "activities/learningmap_1",
      rawXmlPath: "activities/learningmap_1/learningmap.xml",
    } as MbzActivity;
    const comps = mapLearningmapToComponents(vfs, activity);
    expect(comps).toHaveLength(1);
    expect(comps[0]!.type).toBe("interactive_unit");
    expect(comps[0]!.props.imageUrl).toContain("@@PLUGINFILE@@/");
    expect(comps[0]!.props.imageUrl).toContain("מפת");
  });
});
