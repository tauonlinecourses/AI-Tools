/// <reference types="node" />
import vercelHandler from "@workspace/ai-client/vercel";
import { withPlatformAuth } from "@workspace/auth/server";

/**
 * Replace `your-tool-id` with the same id used in:
 * - apps/hub/src/tools.config.ts
 * - ToolAuthGate in src/main.tsx
 * - group_tools rows for this tool
 */
const TOOL_ID = "your-tool-id";

export default withPlatformAuth(vercelHandler, { toolId: TOOL_ID });
