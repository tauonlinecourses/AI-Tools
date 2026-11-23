/**
 * Strip trailing sentence-ending periods for implement-mode display/copy.
 * Does not mutate stored content — edit/review keep the original text.
 */
export function stripTrailingPeriod(text: string): string {
  return text.replace(/\.+\s*$/u, "").trimEnd();
}
