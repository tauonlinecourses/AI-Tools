import { activityTypeIcon } from "../../lib/activityTypeIcon";

interface StructureStats {
  sectionCount: number;
  activityCount: number;
  fileCount: number;
  activityTypeCounts: Record<string, number>;
}

interface StructureOverviewProps {
  stats: StructureStats;
  compact?: boolean;
}

export function structureStatsFromManifest(manifest: {
  sections: unknown[];
  activities: { type: string }[];
  files: unknown[];
}): StructureStats {
  const activityTypeCounts: Record<string, number> = {};
  for (const a of manifest.activities) {
    activityTypeCounts[a.type] = (activityTypeCounts[a.type] || 0) + 1;
  }
  return {
    sectionCount: manifest.sections.length,
    activityCount: manifest.activities.length,
    fileCount: manifest.files.length,
    activityTypeCounts,
  };
}

function typeDisplayLabel(type: string): string {
  if (type === "hvp") return "h5p";
  return type;
}

export function StructureOverview({ stats, compact }: StructureOverviewProps) {
  const types = Object.entries(stats.activityTypeCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div
      className={
        compact
          ? "text-sm text-surface-600 space-y-1.5"
          : "border border-surface-200 bg-surface-50 p-3 text-xs text-surface-700 space-y-2"
      }
    >
      <div
        className={`flex flex-wrap gap-3 font-semibold ${
          compact ? "text-surface-800" : "text-surface-900"
        }`}
      >
        <span>{stats.sectionCount} sections</span>
        <span>{stats.activityCount} activities</span>
        <span>{stats.fileCount} files</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {types.map(([type, n]) => {
          const icon = activityTypeIcon(type);
          return (
            <span
              key={type}
              title={icon?.label ?? typeDisplayLabel(type)}
              className={`inline-flex items-center gap-1.5 border border-surface-200 bg-white px-2 py-0.5 rounded-control font-medium text-surface-700 ${
                compact ? "text-xs" : "text-2xs"
              }`}
            >
              {icon ? (
                <img
                  src={icon.src}
                  alt=""
                  className="w-4 h-4 shrink-0 object-contain"
                />
              ) : (
                <span>{typeDisplayLabel(type)}</span>
              )}
              <span className="tabular-nums">{n}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
