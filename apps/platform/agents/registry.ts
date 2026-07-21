import type { ToolAIConfig } from "./types";
import { config as starter } from "@/app/tools/_starter/ai.config";
import { config as videoCurator } from "@/app/tools/video-curator/ai.config";

/**
 * Central registry mapping toolId → AI config.
 * Adding a tool = one import above + one entry below.
 */
const registry: Record<string, ToolAIConfig> = {
  [starter.toolId]: starter,
  [videoCurator.toolId]: videoCurator,
};

export function getToolConfig(toolId: string): ToolAIConfig | undefined {
  return registry[toolId];
}
