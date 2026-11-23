/**
 * Strip trailing sentence-ending periods for implement-mode answer display/copy.
 * Used on question options only (not the prompt). Does not mutate stored content.
 */
export function stripTrailingPeriod(text: string): string {
  return text.replace(/\.+\s*$/u, "").trimEnd();
}
