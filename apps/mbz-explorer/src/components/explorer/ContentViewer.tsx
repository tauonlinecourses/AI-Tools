import { useEffect, useState } from "react";
import { Badge, Button, Spinner } from "@workspace/ui";
import { codeToHtml } from "shiki";
import type { MbzActivity, MbzManifest, MbzVfs } from "../../lib/mbz-parser";
import { vfsText } from "../../lib/mbz-parser";
import { H5pQuestionCard } from "./H5pQuestionCard";

type Tab = "rendered" | "raw" | "meta";

interface ContentViewerProps {
  manifest: MbzManifest;
  vfs: MbzVfs;
  activity: MbzActivity | null;
  hydrateHtml: (html: string) => string;
  onDecodeSection: (sectionId: string) => void;
  onRedecode: (sectionId: string) => void;
  decoding?: boolean;
}

export function ContentViewer({
  manifest,
  vfs,
  activity,
  hydrateHtml,
  onDecodeSection,
  onRedecode,
  decoding,
}: ContentViewerProps) {
  const [tab, setTab] = useState<Tab>("rendered");
  const [rawHtml, setRawHtml] = useState<string>("");
  const [rawLoading, setRawLoading] = useState(false);

  const parentSection = activity
    ? manifest.sections.find((s) => s.activityRefs.includes(activity.cmid))
    : null;

  useEffect(() => {
    setTab("rendered");
  }, [activity?.cmid]);

  useEffect(() => {
    if (!activity || tab !== "raw") return;
    let cancelled = false;
    (async () => {
      setRawLoading(true);
      const xml = vfsText(vfs, activity.rawXmlPath) ?? `<!-- missing: ${activity.rawXmlPath} -->`;
      try {
        const html = await codeToHtml(xml, { lang: "xml", theme: "github-light" });
        if (!cancelled) setRawHtml(html);
      } catch {
        if (!cancelled) {
          setRawHtml(
            `<pre class="text-xs font-mono whitespace-pre-wrap">${escapeHtml(xml)}</pre>`
          );
        }
      } finally {
        if (!cancelled) setRawLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activity, tab, vfs]);

  if (!activity) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-surface-500 p-8">
        Select an activity from the tree
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "rendered", label: "Rendered" },
    { id: "raw", label: "Raw XML" },
    { id: "meta", label: "Metadata" },
  ];

  return (
    <div className="h-full flex flex-col min-h-0 min-w-0 bg-white">
      <div className="border-b border-surface-200 px-4 py-3 flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-surface-900 truncate">{activity.name}</h2>
          <p className="text-xs text-surface-500 mt-0.5">
            {activity.type} · cmid {activity.cmid}
            {activity.contentStatus === "pending" ? " · pending decode" : ""}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          {parentSection && (
            <button
              type="button"
              title="Re-decode this section"
              onClick={() => onRedecode(parentSection.id)}
              disabled={decoding}
              className="h-8 w-8 flex items-center justify-center text-xs rounded-control border border-surface-200 bg-white text-surface-600 hover:bg-surface-50 hover:text-surface-900 disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M5 13a7 7 0 0112.9-3.7M19 11a7 7 0 01-12.9 3.7" />
              </svg>
            </button>
          )}
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                "h-8 px-3 text-xs font-semibold rounded-control border",
                tab === t.id
                  ? "bg-black text-white border-black"
                  : "bg-white text-surface-700 border-surface-200 hover:bg-surface-50",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === "rendered" && (
          <RenderedPane
            activity={activity}
            parentSectionId={parentSection?.id ?? null}
            hydrateHtml={hydrateHtml}
            onDecodeSection={onDecodeSection}
            decoding={decoding}
          />
        )}
        {tab === "raw" &&
          (rawLoading ? (
            <div className="flex items-center gap-2 text-sm text-surface-500">
              <Spinner size="sm" /> Loading XML…
            </div>
          ) : (
            <div
              className="text-xs overflow-auto [&_pre]:!bg-surface-50 [&_pre]:border [&_pre]:border-surface-200 [&_pre]:p-3"
              dangerouslySetInnerHTML={{ __html: rawHtml }}
            />
          ))}
        {tab === "meta" && (
          <div className="space-y-3 text-sm">
            <MetaRow label="cmid" value={activity.cmid} />
            <MetaRow label="Type" value={activity.type} />
            <MetaRow label="Has grading" value={activity.hasGrading ? "yes" : "no"} />
            <MetaRow label="Content status" value={activity.contentStatus} />
            <MetaRow label="Raw XML path" value={activity.rawXmlPath} />
            {activity.content?.kind === "html" && activity.content.unresolvedTokens.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-surface-700 mb-1">Unresolved tokens</p>
                <div className="flex flex-wrap gap-1">
                  {activity.content.unresolvedTokens.map((t) => (
                    <Badge key={t} variant="warning" size="sm">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {manifest.warnings.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-surface-700 mb-1">Manifest warnings</p>
                <ul className="text-xs text-surface-600 list-disc pl-4 space-y-1">
                  {manifest.warnings
                    .filter((w) => w.includes(activity.cmid) || w.includes(activity.type))
                    .map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 border-b border-surface-100 py-2">
      <span className="w-32 shrink-0 text-xs font-semibold text-surface-500">{label}</span>
      <span className="text-xs text-surface-900 break-all">{value}</span>
    </div>
  );
}

function RenderedPane({
  activity,
  parentSectionId,
  hydrateHtml,
  onDecodeSection,
  decoding,
}: {
  activity: MbzActivity;
  parentSectionId: string | null;
  hydrateHtml: (html: string) => string;
  onDecodeSection: (sectionId: string) => void;
  decoding?: boolean;
}) {
  if (activity.contentStatus === "pending" || !activity.content) {
    return (
      <div className="flex flex-col items-start gap-3 text-sm text-surface-600">
        <p>This activity has not been decoded yet.</p>
        {parentSectionId && (
          <Button
            size="sm"
            loading={decoding}
            onClick={() => onDecodeSection(parentSectionId)}
          >
            Decode this section
          </Button>
        )}
        <p className="text-xs text-surface-500">Raw XML is available without decoding.</p>
      </div>
    );
  }

  const { content } = activity;
  if (content.kind === "html") {
    return (
      <div className="max-w-[800px] mx-auto space-y-3">
        {content.unresolvedTokens.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {content.unresolvedTokens.map((t) => (
              <Badge key={t} variant="warning" size="sm">
                unresolved: {t}
              </Badge>
            ))}
          </div>
        )}
        <div
          dir="auto"
          className={[
            "prose prose-sm max-w-none text-surface-900",
            "mbz-rendered-content",
            "[&_.mbz-unresolved-token]:inline-flex [&_.mbz-unresolved-token]:bg-amber-50 [&_.mbz-unresolved-token]:border [&_.mbz-unresolved-token]:border-amber-200 [&_.mbz-unresolved-token]:px-1 [&_.mbz-unresolved-token]:text-2xs",
          ].join(" ")}
          onClick={(e) => {
            const target = (e.target as HTMLElement).closest?.("a[data-mbz-unresolved]");
            if (target) {
              e.preventDefault();
              const token = decodeURIComponent(target.getAttribute("data-mbz-unresolved") || "");
              alert(`This is a Moodle internal link (${token}) that cannot be resolved outside the live Moodle site.`);
            }
          }}
          dangerouslySetInnerHTML={{ __html: hydrateHtml(content.html) }}
        />
      </div>
    );
  }

  if (content.kind === "h5p") {
    return (
      <H5pQuestionCard
        machineName={content.machineName}
        version={content.version}
        parsed={content.parsed}
        renderer={content.renderer}
        introHtml={content.introHtml ?? null}
        hydrateHtml={hydrateHtml}
      />
    );
  }

  return <p className="text-sm text-surface-500">{content.note}</p>;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
