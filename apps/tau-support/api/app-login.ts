/// <reference types="node" />
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Legacy shared-password gate — retired.
 * Access is Platform Auth (Course-Builder JWT) + group tool entitlement only.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(410).json({
    error:
      "App password login is disabled. Sign in through the Hub with a Platform account that has tau-support access.",
  });
}
