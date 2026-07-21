"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

/**
 * Streaming chat hook pre-wired to the platform AI gateway.
 *
 * Wraps the AI SDK's `useChat` with the correct endpoint and toolId
 * so tool pages never hardcode API paths or transport setup.
 */
export function useToolChat(toolId: string) {
  return useChat({
    transport: new DefaultChatTransport({
      api: "/api/ai",
      body: { toolId },
    }),
  });
}
