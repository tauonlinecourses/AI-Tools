/**
 * Per-tool AI configuration. Each tool declares one of these in its local
 * `ai.config.ts`; the gateway (`app/api/ai/route.ts`) looks it up via
 * `agents/registry.ts` and never trusts model settings from the client.
 */
export interface ToolAIConfig {
  /** Unique tool id — must match the tool's entry in `lib/tools.config.ts`. */
  toolId: string;
  /** Model string supported by the gateway's provider (e.g. "gpt-4o-mini"). */
  model: string;
  /** System prompt with the tool's rules. */
  system: string;
  temperature?: number;
}
