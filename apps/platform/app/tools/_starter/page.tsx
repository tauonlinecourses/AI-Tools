"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Button, Input, PageLayout } from "@workspace/ui";
import { config } from "./ai.config";

export default function StarterToolPage() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/ai",
      body: { toolId: config.toolId },
    }),
  });

  const isBusy = status === "submitted" || status === "streaming";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isBusy) return;
    sendMessage({ text: input });
    setInput("");
  };

  return (
    <PageLayout
      toolName="Starter Tool"
      toolDescription="Template for new tools — copy this folder"
      hubUrl="/"
      maxWidth="md"
    >
      <div className="flex flex-col gap-4">
        <form onSubmit={handleSubmit} className="flex items-start gap-2">
          <div className="flex-1">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the AI anything…"
            />
          </div>
          <Button type="submit" loading={isBusy} disabled={!input.trim()}>
            Send
          </Button>
        </form>

        <div className="flex flex-col gap-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={[
                "border p-3 text-sm whitespace-pre-wrap",
                message.role === "user"
                  ? "border-surface-900 bg-surface-50"
                  : "border-surface-200 bg-white",
              ].join(" ")}
            >
              <span className="block text-2xs font-semibold uppercase text-surface-500 mb-1">
                {message.role === "user" ? "You" : "AI"}
              </span>
              {message.parts.map((part, i) =>
                part.type === "text" ? <span key={i}>{part.text}</span> : null,
              )}
            </div>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}
