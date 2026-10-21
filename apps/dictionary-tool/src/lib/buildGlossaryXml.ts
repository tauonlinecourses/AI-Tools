import type { GlossaryEntry, GlossaryXmlInput } from "./types";

/** Escape for XML text / attribute content (Moodle-style). */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Wrap definition in an RTL paragraph, then XML-escape once (Moodle export style).
 * Example: `text "q"` → `&lt;p dir=&quot;rtl&quot;&gt;text &quot;q&quot;&lt;/p&gt;`
 */
function formatDefinition(definition: string): string {
  return escapeXml(`<p dir="rtl">${definition}</p>`);
}

function formatIntro(intro: string): string {
  const trimmed = intro.trim();
  if (!trimmed) {
    return escapeXml('<p dir="rtl"></p>');
  }
  // Allow pasted HTML; otherwise wrap plain text in an RTL paragraph.
  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return escapeXml(trimmed);
  }
  return escapeXml(`<p dir="rtl">${trimmed}</p>`);
}

function entryXml(entry: GlossaryEntry): string {
  return [
    "      <ENTRY>",
    `        <CONCEPT>${escapeXml(entry.concept)}</CONCEPT>`,
    `        <DEFINITION>${formatDefinition(entry.definition)}</DEFINITION>`,
    "        <FORMAT>1</FORMAT>",
    "        <DEFINITIONTRUST>0</DEFINITIONTRUST>",
    "        <USEDYNALINK>1</USEDYNALINK>",
    "        <CASESENSITIVE>0</CASESENSITIVE>",
    "        <FULLMATCH>0</FULLMATCH>",
    "        <TEACHERENTRY>1</TEACHERENTRY>",
    "      </ENTRY>",
  ].join("\n");
}

/** Build Moodle glossary import XML matching the platform export structure. */
export function buildGlossaryXml(input: GlossaryXmlInput): string {
  const name = input.name.trim() || "מילון מונחים";
  const entriesBlock = input.entries.map(entryXml).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<GLOSSARY>",
    "  <INFO>",
    `    <NAME>${escapeXml(name)}</NAME>`,
    `    <INTRO>${formatIntro(input.intro)}</INTRO>`,
    "    <INTROFORMAT>1</INTROFORMAT>",
    "    <ALLOWDUPLICATEDENTRIES>0</ALLOWDUPLICATEDENTRIES>",
    "    <DISPLAYFORMAT>dictionary</DISPLAYFORMAT>",
    "    <SHOWSPECIAL>1</SHOWSPECIAL>",
    "    <SHOWALPHABET>1</SHOWALPHABET>",
    "    <SHOWALL>1</SHOWALL>",
    "    <ALLOWCOMMENTS>0</ALLOWCOMMENTS>",
    "    <USEDYNALINK>1</USEDYNALINK>",
    "    <DEFAULTAPPROVAL>0</DEFAULTAPPROVAL>",
    "    <GLOBALGLOSSARY>0</GLOBALGLOSSARY>",
    "    <ENTBYPAGE>10</ENTBYPAGE>",
    "    <ENTRIES>",
    entriesBlock,
    "    </ENTRIES>",
    "  </INFO>",
    "</GLOSSARY>",
    "",
  ].join("\n");
}

export function downloadXml(filename: string, xml: string): void {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xml") ? filename : `${filename}.xml`;
  a.click();
  URL.revokeObjectURL(url);
}
