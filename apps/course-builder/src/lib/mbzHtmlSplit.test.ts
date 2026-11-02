import { describe, expect, it } from "vitest";
import {
  splitMoodleHtmlToComponents,
  normalizeMediaUrl,
  splitTopLevelSegments,
} from "./mbzHtmlSplit";

const HAKDAMA = `<div style="max-width: 800px; margin: 0 auto;">
<p><img class="img-fluid" src="@@PLUGINFILE@@/%D7%A9%D7%99%D7%A2%D7%95%D7%A8%201%D7%91%D7%90%D7%A0%D7%A8.png" alt="שיעור 1 - מבוא" width="900" height="197"></p>
<div> </div>
<p style="font-size: 18px;">בשיעור הפתיחה של הקורס נצא למסע.</p>
<div style="position: relative; width: 100%; height: 0; padding-bottom: 56.25%;"><iframe src="https://tau.cloud.panopto.eu/Panopto/Pages/Embed.aspx?id=0758b5f3-a06c-447c-9c67-b4090090118c&amp;autoplay=false" aria-description="שורשי הרעיון"></iframe></div>
<div style="text-align: center;"><a href="$@RESOURCEVIEWBYID*386155@$" target="_blank"><img src="@@PLUGINFILE@@/Frame%2012%20%281%29.png" alt="תמליל להדפסה" width="159" height="60"></a></div>
<div style="width: 100%;"><iframe title="הכירו את הצוות" src="https://view.genially.com/69dcaa7936e807d4a5c6d199"></iframe></div>
<div style="position: relative; padding-bottom: 56.25%;"><iframe src="https://tau.cloud.panopto.eu/Panopto/Pages/Embed.aspx?id=ac08ba10-54ea-4311-873d-b42c00bb5152" aria-description="ברכת נשיא"></iframe></div>
<div style="border: 4px solid #ce2222;"><p><strong>שימו לב:</strong></p><p>יש ללמוד את השיעור בטווח הזמן.</p></div>
</div>`;

describe("splitMoodleHtmlToComponents", () => {
  it("splits הקדמה-style HTML into banner, text, videos, button CTA, interactive", () => {
    const comps = splitMoodleHtmlToComponents(HAKDAMA);
    const types = comps.map((c) => c.type);
    expect(types[0]).toBe("banner");
    expect(comps[0]!.props.imageUrl).toContain("@@PLUGINFILE@@/");
    expect(types).toContain("video");
    expect(types).toContain("button");
    expect(types).toContain("interactive_unit");
    expect(types.filter((t) => t === "video").length).toBeGreaterThanOrEqual(2);
    const cta = comps.find((c) => c.type === "button");
    expect(cta?.props.text).toBe("תמליל להדפסה");
    expect(cta?.props.url).toContain("RESOURCEVIEWBYID");
    const genially = comps.find((c) => c.type === "interactive_unit");
    expect(genially?.props.fileUrl).toContain("genially.com");
    expect(comps.some((c) => c.type === "text" && (c.props.html ?? "").includes("שימו לב"))).toBe(
      true
    );
  });

  it("maps panopto iframe to video with provider", () => {
    const html = `<div style="padding-bottom:56.25%"><iframe src="https://tau.cloud.panopto.eu/Panopto/Pages/Embed.aspx?id=abc" aria-description="טיזר"></iframe></div>`;
    const comps = splitMoodleHtmlToComponents(html);
    expect(comps).toHaveLength(1);
    expect(comps[0]!.type).toBe("video");
    expect(comps[0]!.props.provider).toBe("panopto");
    expect(comps[0]!.props.title).toBe("טיזר");
  });

  it("maps banner-labeled image even without file bytes", () => {
    const html = `<p><img src="@@PLUGINFILE@@/asset-v1_foo%2Btype%40asset%2Bblock%40x.png" alt="באנר - מבוא" width="800" height="175"></p><p>Hello</p>`;
    expect(splitTopLevelSegments(html)).toHaveLength(2);
    const comps = splitMoodleHtmlToComponents(html);
    expect(comps.map((c) => c.type)).toEqual(["banner", "text"]);
  });

  it("unwraps max-width:100% shells so the opening banner is not trapped in text", () => {
    const html = `<div style="max-width: 100%; overflow-x: hidden; text-align: center;">
<p><img class="img-fluid" src="@@PLUGINFILE@@/%D7%91%D7%90%D7%A0%D7%A8.png" alt="גזענות בממד המבני: מדיניות" width="3281" height="718"></p>
<p style="font-size: 18px;">בשיעור הקודם התחלנו להיחשף.</p>
</div>`;
    const comps = splitMoodleHtmlToComponents(html);
    expect(comps.map((c) => c.type)).toEqual(["banner", "text"]);
    expect(comps[0]!.props.imageUrl).toContain("@@PLUGINFILE@@/");
  });

  it("flattens nested aspect-ratio wrappers for video + image buttons", () => {
    const html = `<div style="height: 1000px; text-align: center;">
<p><img class="img-fluid" src="@@PLUGINFILE@@/%D7%91%D7%90%D7%A0%D7%A8%20%D7%A9%D7%99%D7%A2%D7%95%D7%A8%208.png" alt="" width="1641" height="360"></p>
<p style="font-size: 18px;">אנחנו נכנסים לשליש האחרון של הקורס.</p>
<div style="position: relative; width: 100%; height: 0; padding-bottom: 56.25%;">
<div style="position: relative; width: 100%; height: 0; padding-bottom: 56.25%;">
<iframe src="https://tau.cloud.panopto.eu/Panopto/Pages/Embed.aspx?id=abc" aria-description="מבוא"></iframe>
</div>
<div style="text-align: center; margin-top: 20px;">
<a href="$@PLUGINFILEBYCONTEXT*1@$/file.pdf" target="_blank"><img src="@@PLUGINFILE@@/transcript.png" alt="תמליל להדפסה" width="160" height="60"></a>
<a href="$@PLUGINFILEBYCONTEXT*2@$/file2.pdf" target="_blank"><img src="@@PLUGINFILE@@/styled.png" alt="תמליל מעוצב" width="159" height="60"></a>
</div>
</div>
</div>`;
    const comps = splitMoodleHtmlToComponents(html);
    const types = comps.map((c) => c.type);
    expect(types[0]).toBe("banner");
    expect(types).toContain("video");
    expect(types.filter((t) => t === "button").length).toBeGreaterThanOrEqual(2);
    expect(comps.some((c) => c.type === "text")).toBe(true);
  });

  it("maps compact linked image CTAs to button", () => {
    const html = `<div style="text-align: center; margin-top: 20px;"><a
      title="https://moodle.tau.ac.il/2025/mod/resource/view.php?id=386155"
      href="https://moodle.tau.ac.il/2025/mod/resource/view.php?id=386155"
      target="_blank" rel="noopener"><img style="cursor: pointer;"
        src="https://moodle.tau.ac.il/2025/draftfile.php/38677/user/draft/771981965/Frame%2012%20%281%29.png"
        alt="תמליל להדפסה" width="159" height="60"></a></div>`;
    const comps = splitMoodleHtmlToComponents(html);
    expect(comps).toHaveLength(1);
    expect(comps[0]!.type).toBe("button");
    expect(comps[0]!.props.text).toBe("תמליל להדפסה");
    expect(comps[0]!.props.url).toContain("mod/resource/view.php?id=386155");
    expect(comps[0]!.props.align).toBe("center");
  });

  it("maps הפניה / ציר זמן linked images to interactive_unit (not button)", () => {
    const html = `<div style="text-align: center;"><a href="https://view.genially.com/abc123" target="_blank"><img src="@@PLUGINFILE@@/timeline.png" alt="הפניה לציר זמן" width="320" height="100"></a></div>`;
    const comps = splitMoodleHtmlToComponents(html);
    expect(comps).toHaveLength(1);
    expect(comps[0]!.type).toBe("interactive_unit");
    expect(comps[0]!.props.imageUrl).toContain("@@PLUGINFILE@@/");
    expect(comps[0]!.props.fileUrl).toContain("genially.com");
    expect(comps[0]!.props.notes).toBeUndefined();

    const short = splitMoodleHtmlToComponents(
      `<a href="https://example.com/x"><img src="@@PLUGINFILE@@/ref.png" alt="הפניה" width="200" height="80"></a>`
    );
    expect(short[0]!.type).toBe("interactive_unit");
    expect(short[0]!.props.imageUrl).toContain("ref.png");
    expect(short[0]!.props.fileUrl).toBe("https://example.com/x");
  });

  it("maps larger linked preview images to text_unit", () => {
    const html = `<div style="text-align: center;"><a href="https://example.com/doc.pdf" target="_blank"><img src="@@PLUGINFILE@@/preview.png" alt="מסמך לקריאה" width="640" height="360"></a></div>`;
    const comps = splitMoodleHtmlToComponents(html);
    expect(comps).toHaveLength(1);
    expect(comps[0]!.type).toBe("text_unit");
    expect(comps[0]!.props.imageUrl).toContain("@@PLUGINFILE@@/");
    expect(comps[0]!.props.fileUrl).toContain("doc.pdf");
  });

  it("maps Canva / Genially iframes to interactive_unit", () => {
    const canva = splitMoodleHtmlToComponents(
      `<div style="width:100%"><iframe src="https://www.canva.com/design/DAGabc/view?embed" title="מצגת"></iframe></div>`
    );
    expect(canva).toHaveLength(1);
    expect(canva[0]!.type).toBe("interactive_unit");
    expect(canva[0]!.props.fileUrl).toContain("canva.com");
    expect(canva[0]!.props.notes).toBeUndefined();

    const genially = splitMoodleHtmlToComponents(
      `<iframe src="https://view.genially.com/69dcaa7936e807d4a5c6d199" title="הכירו את הצוות - הגדלת גופן"></iframe>`
    );
    expect(genially[0]!.type).toBe("interactive_unit");
    expect(genially[0]!.props.fileUrl).toContain("genially.com");
    expect(genially[0]!.props.notes).toBeUndefined();
  });

  it("keeps inline hyperlinks and colors inside text segments", () => {
    const html = `<p style="font-size: 18px;">קראו את <a href="https://example.com/guide" target="_blank">המדריך</a> ושימו לב ל<span style="color: #ce2222;">הדגשה</span>.</p>`;
    const comps = splitMoodleHtmlToComponents(html);
    expect(comps).toHaveLength(1);
    expect(comps[0]!.type).toBe("text");
    const body = comps[0]!.props.html ?? "";
    expect(body).toContain("<a ");
    expect(body).toContain("https://example.com/guide");
    expect(body).toContain("#ce2222");
  });
});

describe("normalizeMediaUrl", () => {
  it("decodes pluginfile paths", () => {
    expect(normalizeMediaUrl("@@PLUGINFILE@@/Frame%2012.png")).toBe(
      "@@PLUGINFILE@@/Frame 12.png"
    );
  });
});
