/**
 * Load the compiled CJS @workspace/auth/server build for Vercel serverless.
 * Static imports of the package were resolving to raw .ts and crashing the lambda.
 */
export async function loadAuthServer(): Promise<
  typeof import("@workspace/auth/server")
> {
  return import("@workspace/auth/server");
}
