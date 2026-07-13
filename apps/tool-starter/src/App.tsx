import React, { useState } from "react";
import { PageLayout, Card, Button, Input, Spinner } from "@workspace/ui";
import { prompt } from "@workspace/ai-client";

// ─── Replace everything below this line with your tool's actual UI ────────────

export default function App() {
  const [userInput, setUserInput] = useState("");
  const [result, setResult]       = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  async function handleSubmit() {
    if (!userInput.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const response = await prompt(userInput, {
      systemPrompt: "You are a helpful assistant.",
    });

    if (response.error) {
      setError(response.error);
    } else {
      setResult(response.text);
    }

    setLoading(false);
  }

  return (
    <PageLayout
      toolName="Starter Tool"
      toolDescription="Template — replace with your tool's description"
      hubUrl="https://your-hub.vercel.app"
    >
      <div className="flex flex-col gap-6 max-w-2xl">
        <Card>
          <div className="flex flex-col gap-4">
            <Input
              label="Your prompt"
              placeholder="Type something..."
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <Button
              onClick={handleSubmit}
              loading={loading}
              disabled={!userInput.trim()}
            >
              Submit
            </Button>
          </div>
        </Card>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-surface-600">
            <Spinner size="sm" />
            Thinking...
          </div>
        )}

        {error && (
          <Card className="border-danger bg-red-50">
            <p className="text-sm text-danger">{error}</p>
          </Card>
        )}

        {result && (
          <Card>
            <p className="text-sm text-surface-900 whitespace-pre-wrap leading-relaxed">
              {result}
            </p>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
