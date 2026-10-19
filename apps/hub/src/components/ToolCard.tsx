import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Spinner } from "@workspace/ui";
import { toolIsOpenable, type Tool } from "../tools.config";
import { ui, localizeTool, type Locale } from "../i18n";
import { handoffToTool } from "../lib/openTool";
import { ToolIcon } from "./ToolIcon";

export function ToolCard({
  tool,
  locale,
  allowed,
}: {
  tool: Tool;
  locale: Locale;
  allowed: boolean;
}) {
  const navigate = useNavigate();
  const isComingSoon = tool.status === "coming-soon";
  const isAllowed = allowed;
  const isClickable = toolIsOpenable(tool) && isAllowed;
  const copy = localizeTool(locale, tool);
  const t = ui[locale];
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deniedTooltip = !isComingSoon && !isAllowed ? t.noPermission : undefined;

  async function openTool() {
    if (!isClickable || opening) return;
    setError(null);
    setOpening(true);
    try {
      // Hub-hosted tools share PlatformAuth — navigate in-app, no handoff.
      if (tool.hubPath) {
        navigate(tool.hubPath);
        return;
      }
      const target = await handoffToTool(tool);
      window.location.href = target;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open tool");
      setOpening(false);
    }
  }

  return (
    <div
      className={[
        "group relative bg-white border border-surface-200 p-5",
        "flex flex-col gap-3",
        "transition-colors duration-fast",
        isClickable
          ? "hover:bg-surface-50 hover:border-surface-900 cursor-pointer"
          : "opacity-60 cursor-not-allowed",
      ].join(" ")}
      title={deniedTooltip}
      aria-disabled={!isClickable}
      aria-label={
        deniedTooltip ? `${copy.name}. ${deniedTooltip}` : undefined
      }
      onClick={() => void openTool()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void openTool();
        }
      }}
      role={isClickable ? "link" : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-lg font-semibold text-surface-900 truncate">
            {copy.name}
          </h3>
          {isComingSoon && (
            <Badge variant="default" size="sm">{t.comingSoon}</Badge>
          )}
          {opening && <Spinner size="sm" />}
        </div>
        <ToolIcon name={tool.icon} />
      </div>
      <p className="text-sm text-surface-500 leading-relaxed">
        {copy.description}
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
