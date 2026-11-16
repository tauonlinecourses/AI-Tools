import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "@workspace/ui";
import type { AdminGroupRow } from "../../lib/adminApi";
import { REPO_URL, TOOL_DOCS, type ToolDoc } from "./toolDocs";
import { toolDetails } from "../../toolDetails";

/** Selected tool comes from the URL hash (e.g. `#course-builder`) so a tool's doc can be linked. */
function docIdFromHash(): string {
  const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  return TOOL_DOCS.some((d) => d.id === id) ? id : TOOL_DOCS[0].id;
}

/** Tool docs are Hebrew only, so this tab is always RTL regardless of the admin locale. */
export function ToolDocsTab({ groups }: { groups: AdminGroupRow[] }) {
  const [selectedId, setSelectedId] = useState(docIdFromHash);

  useEffect(() => {
    const onHashChange = () => setSelectedId(docIdFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function select(id: string) {
    setSelectedId(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  const doc = TOOL_DOCS.find((d) => d.id === selectedId) ?? TOOL_DOCS[0];

  return (
    <div dir="rtl" className="mt-6 flex flex-col gap-6 md:flex-row md:items-start">
      {/* First child in an RTL row = right side. */}
      <nav
        aria-label="רשימת כלים"
        className="border border-surface-200 bg-white md:sticky md:top-6 md:w-60 md:shrink-0"
      >
        <p className="border-b border-surface-200 bg-surface-50 px-4 py-3 text-xs font-semibold text-surface-500">
          כלים
        </p>
        <ul>
          {TOOL_DOCS.map((d) => {
            const active = d.id === doc.id;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => select(d.id)}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "w-full border-s-2 px-4 py-2.5 text-start text-sm transition-colors",
                    active
                      ? "border-black bg-surface-50 font-semibold text-surface-900"
                      : "border-transparent text-surface-600 hover:bg-surface-50 hover:text-surface-900",
                  ].join(" ")}
                >
                  {d.nameHe}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <ToolDocView doc={doc} groups={groups} />
    </div>
  );
}

function ToolDocView({ doc, groups }: { doc: ToolDoc; groups: AdminGroupRow[] }) {
  const accessGroups = groups.filter((g) => g.toolIds.includes(doc.id));
  const addedAt = toolDetails[doc.id]?.addedAt ?? doc.addedAt;
  const updatedAt = toolDetails[doc.id]?.updatedAt ?? doc.updatedAt;

  return (
    <article className="min-w-0 flex-1 space-y-6 border border-surface-200 bg-white p-6">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold text-surface-900">{doc.nameHe}</h2>
        <p className="text-sm leading-relaxed text-surface-600">{doc.purpose}</p>
        {(addedAt || updatedAt) && (
          <dl className="flex flex-wrap gap-x-6 gap-y-1 pt-1 text-xs">
            {addedAt && (
              <div className="flex gap-1.5">
                <dt className="text-surface-500">נוצר:</dt>
                <dd className="font-medium text-surface-900">{formatDateHe(addedAt)}</dd>
              </div>
            )}
            {updatedAt && (
              <div className="flex gap-1.5">
                <dt className="text-surface-500">עדכון אחרון:</dt>
                <dd className="font-medium text-surface-900">{formatDateHe(updatedAt)}</dd>
              </div>
            )}
          </dl>
        )}
      </header>

      <Section title="תהליך עבודה עיקרי">
        <ol className="list-decimal space-y-1.5 ps-5 text-sm leading-relaxed text-surface-700">
          {doc.workflow.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </Section>

      <Section title="איפה הכלי נמצא">
        <dl className="space-y-2 text-sm">
          <Row label="כתובת">
            <ExternalLink href={doc.liveUrl} />
          </Row>
          <Row label="אירוח">
            <span className="text-surface-700">{doc.hosting}</span>
          </Row>
          <Row label="פרויקט Vercel">
            <ExternalLink href={doc.vercelProjectUrl} />
          </Row>
          <Row label="תיקייה בריפו">
            <div className="space-y-0.5">
              <code dir="ltr" className="block font-mono text-xs text-surface-700">
                {doc.repoPath}
              </code>
              <ExternalLink href={REPO_URL} />
            </div>
          </Row>
        </dl>
      </Section>

      <Section title="מסד נתונים (Supabase)">
        {doc.databases.length === 0 ? (
          <p className="text-sm text-surface-600">
            אין — הכלי לא שומר נתונים משלו.
          </p>
        ) : (
          <ul className="space-y-3 text-sm">
            {doc.databases.map((db) => (
              <li key={db.name} className="space-y-0.5">
                <p className="font-medium text-surface-900">{db.name}</p>
                <p className="text-surface-600">{db.note}</p>
                <ExternalLink href={db.dashboardUrl} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="צוותים עם גישה">
        {doc.accessNote ? (
          <p className="text-sm text-surface-700">{doc.accessNote}</p>
        ) : accessGroups.length === 0 ? (
          <p className="text-sm text-surface-500">אף צוות לא מורשה לכלי הזה כרגע.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {accessGroups.map((g) => (
              <Badge key={g.id} size="sm">
                {g.name}
              </Badge>
            ))}
          </div>
        )}
      </Section>

      <Section title="מבנה הפרויקט">
        <pre
          dir="ltr"
          className="overflow-x-auto border border-surface-200 bg-surface-50 p-4 text-left font-mono text-xs leading-relaxed text-surface-700"
        >
          {doc.structure}
        </pre>
      </Section>
    </article>
  );
}

/** ISO date (YYYY-MM-DD) → e.g. "13 ביולי 2026". */
function formatDateHe(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-surface-100 pt-5">
      <h3 className="text-sm font-semibold text-surface-900">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
      <dt className="w-28 shrink-0 text-surface-500">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** Missing links stay visible so the gap gets filled in `toolDocs.ts`. */
function ExternalLink({ href }: { href: string | null }) {
  if (!href) {
    return <span className="text-xs text-amber-700">חסר קישור — להשלים ב-toolDocs.ts</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      dir="ltr"
      className="break-all text-surface-900 underline underline-offset-2 hover:text-surface-600"
    >
      {href}
    </a>
  );
}
