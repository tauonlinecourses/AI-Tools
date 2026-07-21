import type { ToolAIConfig } from "@/agents/types";

/**
 * Extracted from the original apps/video-curator segmentation call
 * (lib/segmentTranscript.ts → aiChat options). The large per-transcript
 * prompt stays in lib/segmentTranscript.ts — it is built at runtime from
 * the transcript and sent as the user message.
 */
export const config = {
  toolId: "video-curator",
  model: "gpt-4o-mini",
  temperature: 0,
  system: "You are a transcript segmentation engine. You only output valid JSON.",
} satisfies ToolAIConfig;
