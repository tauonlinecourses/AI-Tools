import { useState } from "react";
import { UploadDropzone } from "../components/UploadDropzone";
import { buildGlossaryXml, downloadXml } from "../lib/buildGlossaryXml";
import { parseExcelFile } from "../lib/parseExcel";
import type { GlossaryEntry } from "../lib/types";

const DEFAULT_NAME = "מילון מונחים";
const DEFAULT_INTRO = "להלן מילון מונחים הכולל מושגים מרכזיים המופיעים בקורס:";

export function HomePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [entries, setEntries] = useState<GlossaryEntry[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [glossaryName, setGlossaryName] = useState(DEFAULT_NAME);
  const [intro, setIntro] = useState(DEFAULT_INTRO);
  const [emptyDefinitionCount, setEmptyDefinitionCount] = useState(0);

  async function onFile(file: File) {
    setLoading(true);
    setError(null);
    setWarnings([]);
    try {
      const result = await parseExcelFile(file);
      setEntries(result.entries);
      setEmptyDefinitionCount(result.emptyDefinitionCount);
      setWarnings(result.warnings);
      setFileName(file.name);
      if (result.entries.length === 0) {
        setError("לא נמצאו מושגים בקובץ");
      }
    } catch (err) {
      setEntries([]);
      setFileName(null);
      setError(err instanceof Error ? err.message : "שגיאה בקריאת הקובץ");
    } finally {
      setLoading(false);
    }
  }

  function onDownload() {
    if (entries.length === 0) return;
    const xml = buildGlossaryXml({
      name: glossaryName,
      intro,
      entries,
    });
    const base = (fileName ?? "glossary").replace(/\.(xlsx|xls)$/i, "");
    downloadXml(`${base}.xml`, xml);
  }

  function onReset() {
    setEntries([]);
    setFileName(null);
    setError(null);
    setWarnings([]);
    setEmptyDefinitionCount(0);
    setGlossaryName(DEFAULT_NAME);
    setIntro(DEFAULT_INTRO);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8" dir="rtl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-surface-900">מילון מונחים</h1>
        <p className="mt-2 text-sm text-surface-600">
          העלו קובץ אקסל (מושג + הגדרה, עם או בלי עמודת יחידה) והורידו קובץ XML לייבוא למילון מונחים במודל.
        </p>
      </header>

      {entries.length === 0 ? (
        <UploadDropzone onFile={onFile} loading={loading} error={error} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-surface-700">
              <span className="font-semibold">{fileName}</span>
              {" — "}
              {entries.length} מושגים
              {emptyDefinitionCount > 0 && (
                <span className="text-amber-700">
                  {" "}
                  ({emptyDefinitionCount} ללא הגדרה)
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={onReset}
              className="text-xs font-semibold text-surface-600 underline hover:text-surface-900"
            >
              קובץ אחר
            </button>
          </div>

          {warnings.length > 0 && (
            <ul className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 list-disc list-inside">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          <div className="grid gap-4 sm:grid-cols-1">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-surface-700">שם המילון</span>
              <input
                type="text"
                value={glossaryName}
                onChange={(e) => setGlossaryName(e.target.value)}
                className="h-10 rounded-control border border-surface-300 px-3 text-sm text-surface-900"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-surface-700">תיאור (מבוא)</span>
              <textarea
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                rows={2}
                className="rounded-control border border-surface-300 px-3 py-2 text-sm text-surface-900"
              />
            </label>
          </div>

          <div className="overflow-x-auto border border-surface-200">
            <table className="w-full text-sm text-right">
              <thead className="bg-surface-50 text-xs text-surface-600">
                <tr>
                  <th className="px-3 py-2 font-semibold w-10">#</th>
                  <th className="px-3 py-2 font-semibold">מושג</th>
                  <th className="px-3 py-2 font-semibold">הגדרה</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <tr key={`${entry.concept}-${i}`} className="border-t border-surface-100">
                    <td className="px-3 py-2 text-surface-400 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-surface-900 align-top">
                      {entry.concept}
                    </td>
                    <td className="px-3 py-2 text-surface-700 align-top whitespace-pre-wrap">
                      {entry.definition || (
                        <span className="text-amber-600">— ללא הגדרה —</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-start">
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex h-10 items-center px-4 text-sm font-semibold rounded-control bg-surface-900 text-white hover:bg-surface-800"
            >
              הורד XML לייבוא למודל
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
