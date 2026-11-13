"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeader } from "@/components/layout/AppShell";
import { Alert, Button, DashboardCard, EmptyState, IconSpark, LoadingState, Stat, inputClasses } from "@/components/ui";
import { ApiError, type AIStatus, type ChatResponse } from "@/lib/api";

export default function AIPlaygroundPage() {
  const { api } = useAuth();
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<ChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<AIStatus>("/ai/status")
      .then(setStatus)
      .catch((e) => setStatusError(e instanceof ApiError ? e.message : "Could not load AI status."));
  }, [api]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await api<ChatResponse>("/ai/chat", { method: "POST", body: { messages: [{ role: "user", content: prompt.trim() }] } }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="AI playground"
        description="Prompts go to the FastAPI /ai/chat endpoint. Keys stay on the server; switch providers with AI_PROVIDER."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <DashboardCard title="Prompt">
          <form onSubmit={send} className="flex flex-col gap-3">
            <label htmlFor="prompt" className="text-sm font-medium">
              Message
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              maxLength={20000}
              className={`${inputClasses} h-auto min-h-24 resize-y py-2`}
              placeholder="Summarize the judging criteria in three bullet points."
            />
            {error && <Alert tone="error">{error}</Alert>}
            <div>
              <Button type="submit" loading={loading} disabled={!prompt.trim()}>
                Send
              </Button>
            </div>
          </form>
          <div className="mt-6 border-t border-rule pt-4">
            {loading ? (
              <LoadingState lines={4} label="Waiting for the model" />
            ) : result ? (
              <div className="flex flex-col gap-4">
                <p className="whitespace-pre-wrap text-ink" data-testid="ai-output">
                  {result.text}
                </p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Input tokens" value={result.usage.input_tokens ?? "n/a"} />
                  <Stat label="Output tokens" value={result.usage.output_tokens ?? "n/a"} />
                  <Stat label="Latency" value={`${Math.round(result.latency_ms)} ms`} />
                  <Stat label="Est. cost" value={result.cost_usd == null ? "Unknown" : `$${result.cost_usd.toFixed(5)}`} />
                </div>
              </div>
            ) : (
              <EmptyState icon={<IconSpark />} title="No response yet" description="Send a message to see the model's reply, token usage and latency." />
            )}
          </div>
        </DashboardCard>
        <DashboardCard title="Provider">
          {statusError ? (
            <Alert tone="error">{statusError}</Alert>
          ) : !status ? (
            <LoadingState lines={3} label="Loading provider" />
          ) : (
            <div className="flex flex-col gap-4">
              <Stat label="Provider" value={status.provider} />
              <Stat label="Model" value={<span className="break-all text-lg">{status.model}</span>} />
              {!status.configured && (
                <Alert tone="info" title="API key not set">
                  Add the {status.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "GROQ_API_KEY"} to api/.env and restart the API, or set
                  AI_PROVIDER=mock to try the flow offline.
                </Alert>
              )}
            </div>
          )}
        </DashboardCard>
      </div>
    </>
  );
}
