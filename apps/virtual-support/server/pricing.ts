/**
 * OpenAI list prices used to estimate cost per Ask (USD per 1M tokens).
 *
 * UNVERIFIED: copied from OpenAI's public pricing as known when this file was
 * written. Check https://openai.com/api/pricing and update when prices or
 * models change — cost_usd is stored per row, so old rows keep old prices.
 */
export const PRICES_PER_MILLION: Record<
  string,
  { input: number; output: number }
> = {
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
};

export type ModelUsage = {
  /** Pipeline stage that made the call, e.g. "rewrite" | "embed" | "answer". */
  stage: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

/** Estimated USD cost of the calls; unknown models count as 0. */
export function estimateCostUsd(usage: ModelUsage[]): number {
  let total = 0;
  for (const u of usage) {
    const price = PRICES_PER_MILLION[u.model];
    if (!price) continue;
    total +=
      (u.inputTokens * price.input + u.outputTokens * price.output) / 1_000_000;
  }
  return Math.round(total * 1_000_000) / 1_000_000;
}
