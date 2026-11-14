// Presentational chart primitives for the console (Figma "Chart primitives"): donut,
// stacked per-minute columns, horizontal magnitude bars, sparkline. Pure rendering — all
// math lives in lib/charts.ts, all colors come from the Cobalt SOC tokens via text-*
// classes + currentColor, and every chart sits next to a written legend: color never
// stands alone. OWNER: Jordan (P4).

import type { ReactNode } from "react";
import { cn } from "@/components/ui";
import { STACK_ORDER, donutSegments, type MinuteBucket } from "@/lib/charts";
import type { Level } from "@/lib/types/kairos";
import { LEVEL_LABELS } from "./LevelBadge";

/** Solid level text colors (charts stroke/fill with currentColor). */
const LEVEL_TEXT: Record<Level, string> = {
  low: "text-level-low",
  medium: "text-level-medium",
  high: "text-level-high",
  critical: "text-level-critical",
};

export type DonutDatum = { key: string; label: string; value: number; colorClass: string };

/** Donut with the total in the hole and a labeled legend (value + percent). */
export function Donut({
  data,
  centerLabel,
  size = 104,
  className,
}: {
  data: DonutDatum[];
  /** Line under the big total in the hole, e.g. "open" or "events". */
  centerLabel: string;
  size?: number;
  className?: string;
}) {
  const total = data.reduce((n, d) => n + d.value, 0);
  const segments = donutSegments(data);
  const byKey = new Map(data.map((d) => [d.key, d]));
  return (
    <div className={cn("flex min-w-0 items-center gap-4", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 36 36" width={size} height={size} aria-hidden>
          <circle cx="18" cy="18" r="15.9155" fill="none" strokeWidth="4" className="stroke-paper-3" />
          {segments.map((s) => (
            <circle
              key={s.key}
              cx="18"
              cy="18"
              r="15.9155"
              fill="none"
              strokeWidth="4.5"
              stroke="currentColor"
              strokeDasharray={s.dash}
              strokeDashoffset={s.offset}
              className={byKey.get(s.key)?.colorClass}
            />
          ))}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="num font-display text-2xl font-semibold leading-none text-ink">{total}</span>
          <span className="mt-0.5 text-xs text-muted">{centerLabel}</span>
        </span>
      </div>
      <dl className="m-0 flex min-w-0 flex-col gap-1.5">
        {data.map((d) => (
          <div key={d.key} className={cn("flex items-center gap-1.5 text-sm", d.value === 0 && "text-muted")}>
            <dt className="flex min-w-0 items-center gap-1.5">
              <span aria-hidden className={cn("size-2 shrink-0 rounded-[1px] bg-current", d.colorClass)} />
              <span className="truncate text-ink-2">{d.label}</span>
            </dt>
            <dd className="num m-0 font-semibold text-ink">
              {d.value}
              {total > 0 && <span className="ml-1 font-normal text-muted">{Math.round((d.value / total) * 100)}%</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Stacked per-minute severity columns. The written summary lives in the panel around it. */
export function StackedColumns({
  buckets,
  className,
  columnClassName,
}: {
  buckets: MinuteBucket[];
  className?: string;
  columnClassName?: string;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.total));
  return (
    <div aria-hidden className={cn("flex h-24 items-end gap-1", className)}>
      {buckets.map((b) => (
        <div key={b.minute} className={cn("flex min-w-0 flex-1 flex-col-reverse overflow-hidden rounded-[2px]", columnClassName)}>
          {b.total === 0 ? (
            <div className="h-px bg-rule" />
          ) : (
            STACK_ORDER.map((level) =>
              b.counts[level] > 0 ? (
                <div
                  key={level}
                  className={cn("w-full bg-current", LEVEL_TEXT[level])}
                  style={{ height: `${(b.counts[level] / max) * 100}%`, minHeight: 3 }}
                />
              ) : null,
            )
          )}
        </div>
      ))}
    </div>
  );
}

/** Per-level legend with counts, shared by the severity charts. */
export function LevelLegend({ counts, className }: { counts: Record<Level, number>; className?: string }) {
  return (
    <span className={cn("flex flex-wrap gap-x-3 gap-y-1 text-sm", className)}>
      {(["critical", "high", "medium", "low"] as Level[]).map((l) => (
        <span key={l} className={cn("flex items-center gap-1.5", (counts[l] ?? 0) === 0 && "text-muted")}>
          <span aria-hidden className={cn("size-2 rounded-[1px] bg-current", LEVEL_TEXT[l])} />
          {LEVEL_LABELS[l]} <span className="num font-semibold">{counts[l] ?? 0}</span>
        </span>
      ))}
    </span>
  );
}

/** Horizontal magnitude bars in vivid accent on neutral tracks, with written values. */
export function HBars({
  rows,
  className,
}: {
  rows: Array<{ key: string; label: ReactNode; mono?: boolean; value: number }>;
  className?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <dl className={cn("m-0 flex flex-col gap-2", className)}>
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[minmax(6rem,auto)_minmax(0,1fr)_2ch] items-center gap-x-2.5">
          <dt className={cn("truncate text-sm text-ink-2", r.mono && "num font-mono text-[0.8125rem]")}>{r.label}</dt>
          <dd aria-hidden className="m-0 h-2 overflow-hidden rounded-[2px] bg-paper-3">
            <span className="block h-full rounded-[2px] bg-accent" style={{ width: `${(r.value / max) * 100}%` }} />
          </dd>
          <dd className="num m-0 text-right text-sm font-semibold text-ink">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Tiny cumulative trend line (vivid accent) for a KPI figure. */
export function Sparkline({ points, className }: { points: string; className?: string }) {
  if (!points) return null;
  return (
    <svg viewBox="0 0 100 28" aria-hidden preserveAspectRatio="none" className={cn("h-7 w-full text-accent", className)}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
