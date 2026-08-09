import { useState } from "react";
import { PageLayout, Card, Button, Input, Spinner } from "@workspace/ui";
import { useAI } from "@workspace/ai-client/client";

const SYSTEM_PROMPT = `You are an expert instructional designer. Given a course topic,
produce a clear course outline with:
1. A short course title and one-sentence description
2. Learning objectives (3–5 bullets)
3. Modules (4–8), each with a title, brief summary, and 2–4 lesson titles
Keep the tone practical and concise. Use plain text with clear headings.`;

export default function App() {
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [outline, setOutline] = useState<string | null>(null);
  const { ask, loading, error } = useAI();

  async function handleGenerate() {
    if (!topic.trim()) return;
    setOutline(null);

    const audienceLine = audience.trim()
      ? `Target audience: ${audience.trim()}`
      : "Target audience: general learners";

    const response = await ask({
      messages: [
        {
          role: "user",
          content: `Build a course outline for this topic:\n\n${topic.trim()}\n\n${audienceLine}`,
        },
      ],
      systemPrompt: SYSTEM_PROMPT,
    });

    if (response) {
      setOutline(response);
    }
  }

  return (
    <PageLayout
      toolName="Course Builder"
      toolDescription="Generate structured course outlines from a topic"
    >
      <div className="flex flex-col gap-6 max-w-2xl">
        <Card>
          <div className="flex flex-col gap-4">
            <Input
              label="Course topic"
              placeholder="e.g. Introduction to SQL for analysts"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
            />
            <Input
              label="Audience (optional)"
              placeholder="e.g. beginners with no coding background"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
            />
            <Button
              onClick={handleGenerate}
              loading={loading}
              disabled={!topic.trim()}
            >
              Generate outline
            </Button>
          </div>
        </Card>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-surface-600">
            <Spinner size="sm" />
            Building outline...
          </div>
        )}

        {error && (
          <Card className="border-danger bg-red-50">
            <p className="text-sm text-danger">{error}</p>
          </Card>
        )}

        {outline && (
          <Card>
            <p className="text-sm text-surface-900 whitespace-pre-wrap leading-relaxed">
              {outline}
            </p>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
