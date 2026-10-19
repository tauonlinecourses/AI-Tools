/// <reference types="node" />
import vercelHandler from "@workspace/ai-client/vercel";
import { withPlatformAuth } from "@workspace/auth/server";

export default withPlatformAuth(vercelHandler, { toolId: "video-curator" });
