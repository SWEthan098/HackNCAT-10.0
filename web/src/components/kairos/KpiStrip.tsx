"use client";

// OWNER: Jordan (P4). KPI strip for the incident queue (GET /stats).

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Skeleton, cn } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { formatDecisionTime } from "@/lib/incidents";
import type { Level, Stats } from "@/lib/types/kairos";
import { LEVEL_LABELS, LEVEL_SIGNAL } from "./LevelBadge";

const OPEN_ORDER: Level[] = ["critical", "high", "medium", "low"];

function Kpi({ label, children, tone }: { label: string; children: React.ReactNode; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-1.5 border-rule px-3.5 py-3 sm:px-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={cn("num m-0 font-display text-[1.75rem] font-semibold leading-none", tone ?? "text-ink")}>{children}</dd>
    </div>
  );
}

/** Open incidents split by level: one bar in proportion, plus every count written out. */
function OpenIncidents({ counts }: { counts: Stats["open_incidents"] }) {
  const total = OPEN_ORDER.reduce((n, l) => n + (counts[l] ?? 0), 0);
  return (
    <div className="flex min-w-0 flex-col gap-2 px-3.5 py-3 sm:px-4">
      <dt className="text-sm text-muted">Open incidents</dt>
      <dd className="m-0 flex min-w-0 flex-col gap-2">
        <span className="flex items-center gap-3">
          <span className="num font-display text-[1.75rem] font-semibold leading-none text-ink">{total}</span>
          <span aria-hidden className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-paper-3">
            {total > 0 &&
              OPEN_ORDER.map((l) =>
                (counts[l] ?? 0) > 0 ? (
                  <span key={l} className={cn("h-full border-r border-paper-2 last:border-r-0", LEVEL_SIGNAL[l])} style={{ width: `${((counts[l] ?? 0) / total) * 100}%` }} />
                ) : null,
              )}
          </span>
        </span>
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {OPEN_ORDER.map((l) => (
            <span key={l} className={cn("flex items-center gap-1.5", (counts[l] ?? 0) === 0 && "text-muted")}>
              <span aria-hidden className={cn("size-2 rounded-[1px]", LEVEL_SIGNAL[l])} />
              {LEVEL_LABELS[l]} <span className="num font-semibold">{counts[l] ?? 0}</span>
            </span>
          ))}
        </span>
      </dd>
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
      <p className="rounded-card border border-rule bg-paper-2 px-4 py-3 text-sm text-ink-2">
        KPI numbers didn&apos;t load ({error}).{" "}
        <button type="button" onClick={load} className="font-medium text-accent underline underline-offset-4">
          Try again
        </button>
      </p>
    );
  }
  if (!stats) return <Skeleton className="h-[5.5rem] w-full rounded-card" />;

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
      <Kpi label="Attacks blocked">{stats.attacks_blocked}</Kpi>
      <Kpi label="Breaches" tone={stats.breaches > 0 ? "text-level-critical-ink" : undefined}>
        {stats.breaches}
      </Kpi>
      <Kpi label="False positives">{stats.false_positives}</Kpi>
      <Kpi label="Avg decision time">{formatDecisionTime(stats.avg_decision_ms)}</Kpi>
    </dl>
  );
}
