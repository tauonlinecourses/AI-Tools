import type { ToolAIConfig } from "@/agents/types";

export const config = {
  toolId: "_starter",
  model: "gpt-4o-mini",
  temperature: 0.7,
  system: `You are a helpful assistant inside an internal AI tools platform.
Answer concisely. This is a starter template — replace this prompt with your tool's rules.`,
} satisfies ToolAIConfig;
