/**
 * Keeps login membership loads in order: which user is active, and which
 * request is the newest. An older response must never overwrite a newer one
 * or repopulate state after sign-out.
 */
export function createMembershipTracker() {
  let activeUserId: string | null = null;
  let latestRequest = 0;

  return {
    /** Returns true when this is a different user from the active one. */
    setActiveUser(userId: string): boolean {
      const changed = activeUserId !== userId;
      activeUserId = userId;
      return changed;
    },
    beginRequest(): number {
      latestRequest += 1;
      return latestRequest;
    },
    isLatest(request: number): boolean {
      return request === latestRequest;
    },
    /** Sign-out: forget the user and invalidate anything still in flight. */
    reset(): void {
      activeUserId = null;
      latestRequest += 1;
    },
  };
}
