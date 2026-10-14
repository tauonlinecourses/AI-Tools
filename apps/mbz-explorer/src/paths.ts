/** Hub-hosted base path (same origin as the Tools Hub). */
export const MBZ_BASE = "/mbz-explorer";

export function mbzHomePath(): string {
  return MBZ_BASE;
}

export function mbzExplorerPath(sha1: string): string {
  return `${MBZ_BASE}/f/${sha1}`;
}
