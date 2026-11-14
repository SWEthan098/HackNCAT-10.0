"use client";

// OWNER: Jordan (P4). KPI band for the incident queue (GET /stats): one hairline-divided
// strip, open incidents as a severity donut, and a cumulative sparkline under "Attacks
// blocked" when the page shares its live event stream. Color never stands alone: every
// figure and slice is written out next to its mark.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Skeleton, cn } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { sparkPoints } from "@/lib/charts";
import { formatDecisionTime } from "@/lib/incidents";
import type { KairosEvent, Level, Stats } from "@/lib/types/kairos";
import { LEVEL_LABELS } from "./LevelBadge";
import { Donut } from "./charts";

const OPEN_ORDER: Level[] = ["critical", "high", "medium", "low"];

const LEVEL_TEXT: Record<Level, string> = {
  low: "text-level-low",
  medium: "text-level-medium",
  high: "text-level-high",
  critical: "text-level-critical",
};

function Kpi({ label, children, tone, extra }: { label: string; children: React.ReactNode; tone?: string; extra?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-1.5 border-rule px-3.5 py-3 sm:px-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={cn("num m-0 font-display text-2xl font-semibold leading-none", tone ?? "text-ink")}>{children}</dd>
      {extra}
    </div>
  );
}

/** Open incidents split by level: the severity donut with every count written out. */
function OpenIncidents({ counts }: { counts: Stats["open_incidents"] }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 px-3.5 py-3 sm:px-4">
      <dt className="text-sm text-muted">Open incidents</dt>
      <dd className="m-0 min-w-0">
        <Donut
          size={84}
          centerLabel="open"
          data={OPEN_ORDER.map((l) => ({ key: l, label: LEVEL_LABELS[l], value: counts[l] ?? 0, colorClass: LEVEL_TEXT[l] }))}
        />
      </dd>
    </div>
  );
}

export function KpiStrip({ events }: { events?: KairosEvent[] | null }) {
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
      <p className="rounded-card border border-rule bg-paper-2 px-4 py-3 text-sm text-ink-2">
        KPI numbers didn&apos;t load ({error}).{" "}
        <button type="button" onClick={load} className="font-medium text-accent underline underline-offset-4">
          Try again
        </button>
      </p>
    );
  }
  if (!stats) return <Skeleton className="h-[5.5rem] w-full rounded-card" />;

  // Trend of blocked events this session, drawn only when the page shares its stream.
  const blockedTrend = sparkPoints(events ?? [], (e) => e.verdict === "blocked");

  return (
    <dl
      aria-label="Key numbers"
      className={cn(
        "m-0 grid grid-cols-2 overflow-hidden rounded-card border border-rule bg-paper-2",
        "min-[900px]:grid-cols-[minmax(17rem,1.7fr)_repeat(4,minmax(0,1fr))]",
        // Hairlines between cells: every cell gets a top and left rule, the grid edge hides the outer ones.
        "[&>*]:-ml-px [&>*]:-mt-px [&>*]:border-l [&>*]:border-t [&>*]:border-rule",
        "[&>:first-child]:col-span-2 min-[900px]:[&>:first-child]:col-span-1",
      )}
    >
      <OpenIncidents counts={stats.open_incidents} />
      <Kpi
        label="Attacks blocked"
        extra={
          blockedTrend ? (
            <dd aria-hidden className="m-0 -mb-1">
              <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-6 w-full text-accent">
                <polyline points={blockedTrend} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            </dd>
          ) : undefined
        }
      >
        {stats.attacks_blocked}
      </Kpi>
      <Kpi label="Breaches" tone={stats.breaches > 0 ? "text-level-critical-ink" : undefined}>
        {stats.breaches}
      </Kpi>
      <Kpi label="False positives">{stats.false_positives}</Kpi>
      <Kpi label="Avg decision time">{formatDecisionTime(stats.avg_decision_ms)}</Kpi>
    </dl>
  );
}
