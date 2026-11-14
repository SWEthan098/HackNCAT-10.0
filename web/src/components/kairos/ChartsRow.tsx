"use client";

// OWNER: Jordan (P4). Charts for the Defender Console dashboard (Figma chart-forward
// revision): threat activity per minute by severity, verdict mix donut, listener activity
// bars, and the top-techniques panel for the right rail. Everything is computed from the
// SAME live event stream the feed shows — labeled "this session" (or "demo data" when the
// feed is on its honest offline fallback) and never invented.

import { useEffect, useMemo, useState } from "react";
import { countBy, minuteBuckets, topTechniques } from "@/lib/charts";
import type { KairosEvent, Level, Sensor } from "@/lib/types/kairos";
import { Panel } from "./Panel";
import { Donut, HBars, LevelLegend, StackedColumns } from "./charts";

const SENSOR_LABELS: Record<Sensor, string> = {
  login_guard: "Login Guard",
  comms_guard: "Comms Guard",
  agent_firewall: "Agent Firewall",
};

const WINDOW_MINUTES = 15;

/**
 * Wall clock for the per-minute windows, null until mount: reading the time during render
 * is non-deterministic and breaks prerendering. Ticks once a minute so the window keeps
 * sliding even when no new events arrive.
 */
export function useMinuteClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // The first tick is a 0ms timeout, not a sync set: the hooks lint forbids cascading
    // renders from effects, and one frame without charts is invisible.
    const kick = window.setTimeout(() => setNow(new Date()), 0);
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(t);
    };
  }, []);
  return now;
}

export function ChartsRow({ events, demo }: { events: KairosEvent[] | null; demo?: boolean }) {
  const now = useMinuteClock();
  const buckets = useMemo(() => (now ? minuteBuckets(events ?? [], WINDOW_MINUTES, now) : []), [events, now]);
  const windowTotals = useMemo(() => {
    const totals: Record<Level, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const b of buckets) for (const l of Object.keys(totals) as Level[]) totals[l] += b.counts[l];
    return totals;
  }, [buckets]);
  const verdicts = useMemo(() => countBy(events ?? [], "verdict"), [events]);
  const sensors = useMemo(() => countBy(events ?? [], "sensor"), [events]);

  // Charts only earn their place once there is anything to show (and a mounted clock).
  if (!now || !events || events.length === 0) return null;
  const meta = <span>{demo ? "demo data" : "this session"}</span>;

  return (
    <div className="grid items-stretch gap-3 sm:gap-4 min-[900px]:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] min-[1100px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <Panel title="Threat activity" meta={<span>last {WINDOW_MINUTES} min · {demo ? "demo data" : "this session"}</span>}>
        {buckets.some((b) => b.total > 0) ? (
          <>
            <StackedColumns buckets={buckets} />
            <LevelLegend counts={windowTotals} className="mt-2.5" />
          </>
        ) : (
          <p className="flex h-24 items-center text-sm text-muted">
            Nothing in the last {WINDOW_MINUTES} minutes. New events chart here the moment they land.
          </p>
        )}
      </Panel>
      <Panel title="Verdict mix" meta={meta}>
        <Donut
          centerLabel={(events?.length ?? 0) === 1 ? "event" : "events"}
          data={[
            { key: "blocked", label: "Blocked", value: verdicts.get("blocked") ?? 0, colorClass: "text-level-critical" },
            { key: "flagged", label: "Flagged", value: verdicts.get("flagged") ?? 0, colorClass: "text-level-medium" },
            { key: "allowed", label: "Allowed", value: verdicts.get("allowed") ?? 0, colorClass: "text-level-low" },
          ]}
        />
      </Panel>
      <Panel title="Listener activity" meta={meta} className="hidden min-[1100px]:flex">
        <HBars
          className="pt-1"
          rows={(Object.keys(SENSOR_LABELS) as Sensor[]).map((s) => ({
            key: s,
            label: SENSOR_LABELS[s],
            value: sensors.get(s) ?? 0,
          }))}
        />
      </Panel>
    </div>
  );
}

/** Most-seen MITRE techniques this session (right rail, above the live feed). */
export function TopTechniques({ events, demo, className }: { events: KairosEvent[] | null; demo?: boolean; className?: string }) {
  const rows = useMemo(() => topTechniques(events ?? []), [events]);
  if (rows.length === 0) return null;
  return (
    <Panel title="Top techniques" meta={<span>{demo ? "demo data" : "this session"}</span>} className={className}>
      <HBars
        rows={rows.map((t) => ({
          key: t.id,
          label: <span title={t.name}>{t.id}</span>,
          mono: true,
          value: t.count,
        }))}
      />
    </Panel>
  );
}
