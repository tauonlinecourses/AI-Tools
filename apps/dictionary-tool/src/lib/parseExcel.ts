import * as XLSX from "xlsx";
import type { GlossaryEntry, ParseExcelResult } from "./types";

/** Preferred: מושג / הגדרה. Also accept older synonyms. */
const CONCEPT_HEADERS = ["מושג", "שם המושג", "שם מושג", "concept", "term"];
const DEFINITION_HEADERS = ["הגדרה", "הסבר", "definition", "desc", "description"];
/** Optional third column — never written to Moodle XML. */
const UNIT_HEADERS = ["יחידה", "unit", "module"];

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/\u200f|\u200e/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cellText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  const normalizedCandidates = candidates.map((c) => normalizeHeader(c));
  for (let i = 0; i < headers.length; i++) {
    if (normalizedCandidates.includes(headers[i]!)) return i;
  }
  return -1;
}

/**
 * Parse the first sheet into glossary entries (מושג + הגדרה only).
 * Supports 2-column sheets, or 3-column sheets with optional יחידה (ignored for XML).
 * Prefers Hebrew headers מושג / הגדרה; falls back to columns A/B.
 */
export async function parseExcelFile(file: File): Promise<ParseExcelResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("הקובץ אינו מכיל גיליונות");
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("לא ניתן לקרוא את הגיליון הראשון");
  }

  const rows = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(
    sheet,
    { header: 1, defval: "", raw: false }
  );

  const warnings: string[] = [];
  if (rows.length === 0) {
    return { entries: [], emptyDefinitionCount: 0, warnings: ["הגיליון ריק"] };
  }

  const headerCells = (rows[0] ?? []).map(normalizeHeader);
  let conceptIdx = findColumnIndex(headerCells, CONCEPT_HEADERS);
  let definitionIdx = findColumnIndex(headerCells, DEFINITION_HEADERS);
  const unitIdx = findColumnIndex(headerCells, UNIT_HEADERS);
  let dataStart = 0;

  if (conceptIdx >= 0 && definitionIdx >= 0) {
    dataStart = 1;
    if (unitIdx >= 0) {
      warnings.push("עמודת «יחידה» זוהתה ותתעלם בייצוא ל-XML");
    }
  } else {
    conceptIdx = 0;
    definitionIdx = 1;
    warnings.push("לא נמצאו כותרות «מושג» / «הגדרה» — משתמש בעמודות א׳ וב׳");
  }

  const entries: GlossaryEntry[] = [];
  let emptyDefinitionCount = 0;

  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const concept = cellText(row[conceptIdx]);
    const definition = cellText(row[definitionIdx]);

    if (!concept && !definition) continue;
    if (!concept) {
      warnings.push(`שורה ${r + 1}: חסר מושג — דילוג`);
      continue;
    }
    if (!definition) emptyDefinitionCount += 1;
    entries.push({ concept, definition });
  }

  if (entries.length === 0) {
    warnings.push("לא נמצאו מושגים בקובץ");
  }

  return { entries, emptyDefinitionCount, warnings };
}
