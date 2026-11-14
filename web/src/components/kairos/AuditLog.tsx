"use client";

// OWNER: Jordan (P4). Audit log + Verify Integrity (checklist step 13). Every decision in order,
// and a button that re-checks the tamper-evident hash chain (GET /audit/verify).
//
// Audit detail is written by the backend from code templates with redacted data only, but it
// still renders as plain text (no markdown/images/links), same rule as everywhere else.

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Alert, Button, EmptyState, ErrorState, IconCheck, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import type { AuditVerifyResponse } from "@/lib/types/kairos";

type AuditRow = { id: number; created_at: string; actor: string; action: string; detail: Record<string, unknown> };

function asRow(row: unknown): AuditRow | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "number" || typeof r.created_at !== "string" || typeof r.actor !== "string" || typeof r.action !== "string") {
    return null;
  }
  return { id: r.id, created_at: r.created_at, actor: r.actor, action: r.action, detail: (r.detail as Record<string, unknown>) ?? {} };
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { hour12: false, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

type VerifyState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok"; checked: number }
  | { status: "tampered"; checked: number; firstBad: string | null }
  | { status: "error"; message: string };

function VerifyBanner({ state }: { state: VerifyState }) {
  if (state.status === "ok") {
    return (
      <Alert tone="success" title="Chain verified">
        All {state.checked} entries check out. No record has been changed or removed.
      </Alert>
    );
  }
  if (state.status === "tampered") {
    return (
      <Alert tone="error" title="The audit log has been tampered with">
        {state.checked} entries were checked{state.firstBad ? `; the first bad entry is ${state.firstBad}` : ""}. The chain is broken.
      </Alert>
    );
  }
  if (state.status === "error") {
    return (
      <Alert tone="error" title="Couldn't verify the log">
        {state.message}
      </Alert>
    );
  }
  return null;
}

export function AuditLog() {
  const { api } = useAuth();
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [verify, setVerify] = useState<VerifyState>({ status: "idle" });

  const load = () => {
    const supabase = createClient();
    supabase
      .from("audit_log")
      .select("id, created_at, actor, action, detail")
      .order("id", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error || !data) {
          setLoadError(error?.message ?? "The audit log didn't load.");
          return;
        }
        setRows(data.map(asRow).filter((r): r is AuditRow => r !== null));
        setLoadError(null);
      });
  };
  useEffect(load, []);

  // Live append: new decisions show up without a refresh.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("audit-log")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_log" }, (payload) => {
        const row = asRow(payload.new);
        if (row) setRows((list) => (list?.some((r) => r.id === row.id) ? list : [row, ...(list ?? [])]));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const runVerify = async () => {
    setVerify({ status: "checking" });
    try {
      const res = await api<AuditVerifyResponse>("/audit/verify");
      setVerify(
        res.ok
          ? { status: "ok", checked: res.entries_checked }
          : { status: "tampered", checked: res.entries_checked, firstBad: res.first_bad_entry },
      );
    } catch (e) {
      setVerify({ status: "error", message: e instanceof ApiError ? e.message : "The request failed." });
    }
  };

  return (
    <section aria-label="Audit log" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Audit log</h1>
          <p className="mt-1 text-ink-2">Every decision Kairos and its operators made, in a tamper-evident chain.</p>
        </div>
        <Button onClick={runVerify} loading={verify.status === "checking"} icon={<IconCheck size={16} />}>
          Verify integrity
        </Button>
      </div>

      <VerifyBanner state={verify} />

      {loadError ? (
        <ErrorState title="Couldn't load the audit log" message={loadError} onRetry={load} />
      ) : !rows ? (
        <LoadingState label="Loading the audit log" lines={6} />
      ) : rows.length === 0 ? (
        <EmptyState title="No entries yet" description="Every decision, approval and containment will be recorded here in order." />
      ) : (
        <ol className="flex flex-col">
          {rows.map((r) => (
            <li key={r.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 border-b border-rule py-2.5 last:border-b-0">
              <span className="num whitespace-nowrap pt-0.5 text-xs text-muted">{when(r.created_at)}</span>
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-medium">{r.action}</span> <span className="text-muted">by {r.actor}</span>
                </p>
                {Object.keys(r.detail).length > 0 && (
                  <p className="mt-0.5 font-mono text-xs text-ink-2 [overflow-wrap:anywhere]">{JSON.stringify(r.detail)}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
