import { useMemo } from "react";
import type { MbzActivity, MbzManifest } from "../../lib/mbz-parser";

interface ResourceListViewProps {
  manifest: MbzManifest;
  onSelectActivity: (cmid: string) => void;
}

export function ResourceListView({ manifest, onSelectActivity }: ResourceListViewProps) {
  const resources = useMemo(
    () =>
      manifest.activities
        .filter((activity) => activity.type === "resource")
        .map((activity) => ({
          activity,
          sectionName:
            manifest.sections.find((section) => section.activityRefs.includes(activity.cmid))?.name ??
            "Unknown section",
        })),
    [manifest]
  );

  return (
    <div className="h-full flex flex-col min-h-0 min-w-0 bg-white">
      <div className="border-b border-surface-200 px-6 py-4 shrink-0">
        <h2 className="text-lg font-semibold text-surface-900">Resources</h2>
        <p className="text-sm text-surface-500 mt-1">
          Open a Moodle resource activity to inspect its rendered content, raw XML, and metadata.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {resources.length === 0 ? (
          <div className="rounded-lg border border-dashed border-surface-300 bg-surface-50 p-6 text-sm text-surface-500">
            No resource activities were found in this backup.
          </div>
        ) : (
          <div className="space-y-3">
            {resources.map(({ activity, sectionName }) => (
              <ResourceCard
                key={activity.cmid}
                activity={activity}
                sectionName={sectionName}
                onOpen={() => onSelectActivity(activity.cmid)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ResourceCard({
  activity,
  sectionName,
  onOpen,
}: {
  activity: MbzActivity;
  sectionName: string;
  onOpen: () => void;
}) {
  const referencedCount =
    activity.content?.kind === "html" || activity.content?.kind === "h5p"
      ? activity.content.referencedFiles.length
      : 0;
  const unresolvedCount =
    activity.content?.kind === "html" || activity.content?.kind === "h5p"
      ? activity.content.unresolvedTokens.length
      : 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-surface-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-[#0F6CBF] hover:bg-[#0F6CBF]/[0.03]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-surface-900 truncate">{activity.name}</h3>
          <p className="text-xs text-surface-500 mt-1">
            section: {sectionName} · cmid {activity.cmid}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${
            activity.contentStatus === "decoded"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {activity.contentStatus}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-surface-600">
        <span className="rounded-full bg-surface-100 px-2 py-1">type: {activity.type}</span>
        <span className="rounded-full bg-surface-100 px-2 py-1">
          attached files: {referencedCount}
        </span>
        <span className="rounded-full bg-surface-100 px-2 py-1">
          unresolved links: {unresolvedCount}
        </span>
        <span className="rounded-full bg-surface-100 px-2 py-1">
          grading: {activity.hasGrading ? "yes" : "no"}
        </span>
      </div>

      <p className="mt-3 text-xs text-surface-500 break-all">{activity.rawXmlPath}</p>
    </button>
  );
}
