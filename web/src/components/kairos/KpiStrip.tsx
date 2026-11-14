"use client";

// OWNER: Jordan (P4). KPI strip for the incident queue (GET /stats).

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Skeleton } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { formatDecisionTime } from "@/lib/incidents";
import type { Level, Stats } from "@/lib/types/kairos";
import { LevelBadge } from "./LevelBadge";

const OPEN_ORDER: Level[] = ["critical", "high", "medium", "low"];

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-28 flex-col gap-1 border-l border-rule py-0.5 pl-3 first:border-l-0 first:pl-0">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="num m-0 font-display text-xl font-semibold leading-none text-ink">{children}</dd>
    </div>
  );
}

export function KpiStrip() {
  const { api } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Stats>("/stats")
      .then((s) => {
        setStats(s);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, [api]);
  useEffect(load, [load]);

  if (error) {
    return (
      <p className="rounded-input border border-rule bg-paper-2 px-3 py-2 text-sm text-ink-2">
        KPI numbers didn&apos;t load ({error}).{" "}
        <button type="button" onClick={load} className="font-medium text-accent underline underline-offset-4">
          Try again
        </button>
      </p>
    );
  }
  if (!stats) return <Skeleton className="h-16 w-full" />;

  const openTotal = OPEN_ORDER.reduce((n, l) => n + (stats.open_incidents[l] ?? 0), 0);
  return (
    <dl className="flex flex-wrap items-start gap-x-3 gap-y-4 rounded-card border border-rule bg-paper px-4 py-3 shadow-card">
      <Kpi label="Open incidents">
        <span className="flex flex-wrap items-center gap-1.5">
          {openTotal}
          {OPEN_ORDER.filter((l) => (stats.open_incidents[l] ?? 0) > 0).map((l) => (
            <LevelBadge key={l} level={l} risk={undefined} className="text-[11px]">
              {stats.open_incidents[l]}
            </LevelBadge>
          ))}
        </span>
      </Kpi>
      <Kpi label="Attacks blocked">{stats.attacks_blocked}</Kpi>
      <Kpi label="Breaches">{stats.breaches}</Kpi>
      <Kpi label="False positives">{stats.false_positives}</Kpi>
      <Kpi label="Avg decision time">{formatDecisionTime(stats.avg_decision_ms)}</Kpi>
    </dl>
  );
}
