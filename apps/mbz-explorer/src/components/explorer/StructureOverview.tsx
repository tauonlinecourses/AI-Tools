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
  selectedType?: string | null;
  onSelectType?: (type: string) => void;
  selectableTypes?: string[];
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

export function StructureOverview({
  stats,
  compact,
  selectedType,
  onSelectType,
  selectableTypes,
}: StructureOverviewProps) {
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
          const isSelected = selectedType === type;
          const isInteractive = !!onSelectType && (!!selectableTypes ? selectableTypes.includes(type) : true);
          const className = `inline-flex items-center gap-1.5 border px-2 py-0.5 rounded-control font-medium transition-colors ${
            compact ? "text-xs" : "text-2xs"
          } ${
            isSelected
              ? "border-[#0F6CBF] bg-[#0F6CBF] text-white"
              : "border-surface-200 bg-white text-surface-700"
          } ${isInteractive ? "cursor-pointer hover:border-surface-300 hover:text-surface-900" : ""}`;

          const content = (
            <>
              {icon ? (
                <img
                  src={icon.src}
                  alt=""
                  className={`w-4 h-4 shrink-0 object-contain ${
                    isSelected && icon.invertWhenSelected ? "brightness-0 invert" : ""
                  }`}
                />
              ) : (
                <span>{typeDisplayLabel(type)}</span>
              )}
              <span className="tabular-nums">{n}</span>
            </>
          );

          if (isInteractive && onSelectType) {
            return (
              <button
                key={type}
                type="button"
                title={icon?.label ?? typeDisplayLabel(type)}
                className={className}
                onClick={() => onSelectType(type)}
              >
                {content}
              </button>
            );
          }

          return (
            <span
              key={type}
              title={icon?.label ?? typeDisplayLabel(type)}
              className={className}
            >
              {content}
            </span>
          );
        })}
      </div>
    </div>
  );
}
