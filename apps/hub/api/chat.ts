/// <reference types="node" />
import vercelHandler from "@workspace/ai-client/vercel";
import { withPlatformAuth } from "@workspace/auth/server";

/** Hub chat requires a signed-in, approved platform user (no tool check). */
export default withPlatformAuth(vercelHandler);
