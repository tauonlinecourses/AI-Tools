import type { ToolAIConfig } from "./types";
import { config as starter } from "@/app/tools/_starter/ai.config";

/**
 * Central registry mapping toolId → AI config.
 * Adding a tool = one import above + one entry below.
 */
const registry: Record<string, ToolAIConfig> = {
  [starter.toolId]: starter,
};

export function getToolConfig(toolId: string): ToolAIConfig | undefined {
  return registry[toolId];
}
