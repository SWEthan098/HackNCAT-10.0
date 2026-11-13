"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeader } from "@/components/layout/AppShell";
import { Button, DataTable, type Column } from "@/components/ui";
import { API_URL, ApiError, apiFetch, type AIStatus, type Me, type Readiness } from "@/lib/api";

type Check = { id: string; name: string; result: "Pass" | "Fail" | "Not configured"; detail: string };

type Api = ReturnType<typeof useAuth>["api"];

/** Live end-to-end checks: browser -> API -> Supabase, plus auth and AI configuration. */
async function collectChecks(api: Api): Promise<Check[]> {
  const out: Check[] = [];
  const message = (e: unknown) => (e instanceof ApiError ? e.message : String(e));
  try {
    await apiFetch<{ status: string }>("/health");
    out.push({ id: "api", name: "API reachable", result: "Pass", detail: API_URL });
  } catch (e) {
    out.push({ id: "api", name: "API reachable", result: "Fail", detail: message(e) });
  }
  try {
    const r = await apiFetch<Readiness>("/health/ready");
    out.push({ id: "db", name: "Database", result: "Pass", detail: `Supabase query ${r.checks.database}` });
  } catch (e) {
    out.push({ id: "db", name: "Database", result: "Fail", detail: message(e) });
  }
  try {
    const me = await api<Me>("/me");
    out.push({ id: "auth", name: "Session verified by API", result: "Pass", detail: `Token accepted for ${me.email}` });
    out.push({ id: "profile", name: "Profile row", result: "Pass", detail: `profiles.id = ${me.profile.id}` });
  } catch (e) {
    out.push({ id: "auth", name: "Session verified by API", result: "Fail", detail: message(e) });
  }
  try {
    const ai = await api<AIStatus>("/ai/status");
    out.push({
      id: "ai",
      name: "AI provider",
      result: ai.configured ? "Pass" : "Not configured",
      detail: ai.configured ? `${ai.provider} with ${ai.model}` : `${ai.provider} selected; its API key is not set on the server`,
    });
  } catch (e) {
    out.push({ id: "ai", name: "AI provider", result: "Fail", detail: message(e) });
  }
  return out;
}

export default function SystemPage() {
  const { api } = useAuth();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    collectChecks(api).then((out) => !cancelled && setChecks(out));
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function rerun() {
    setRunning(true);
    setChecks(null);
    setChecks(await collectChecks(api));
    setRunning(false);
  }

  const columns: Column<Check>[] = [
    { key: "name", header: "Check", cell: (c) => <span className="font-medium">{c.name}</span> },
    {
      key: "result",
      header: "Result",
      cell: (c) => (
        <span className={c.result === "Pass" ? "text-success" : c.result === "Fail" ? "text-error" : "text-muted"}>{c.result}</span>
      ),
    },
    { key: "detail", header: "Detail", cell: (c) => <span className="break-words text-ink-2">{c.detail}</span> },
  ];

  return (
    <>
      <PageHeader
        title="System status"
        description="Each row is a live request made just now from your browser."
        actions={
          <Button variant="secondary" onClick={rerun} loading={running}>
            Run checks again
          </Button>
        }
      />
      <DataTable caption="System checks" columns={columns} rows={checks} rowKey={(c) => c.id} loading={!checks} />
    </>
  );
}
