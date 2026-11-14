"use client";

// OWNER: Jordan (P4). Audience view for the projector (checklist step 12): the incident queue
// filtered to source = audience, in big type readable from the back of the room, live via
// Realtime. Titles can quote attacker text, so everything renders as plain text.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { attackFamily, minuteBuckets } from "@/lib/charts";
import { STATUS_LABELS, asIncident, sortIncidents, upsertIncident } from "@/lib/incidents";
import { addEvent, isKairosEvent } from "@/lib/liveEvents";
import { createClient } from "@/lib/supabase/client";
import type { Incident, KairosEvent, Level } from "@/lib/types/kairos";
import { useMinuteClock } from "./ChartsRow";
import { LevelBadge } from "./LevelBadge";
import { Panel } from "./Panel";
import { Donut, LevelLegend, StackedColumns } from "./charts";

/** Distinct audience attackers behind the incidents (campaign card: "N attackers"). */
function attackerCount(incidents: Incident[]): number {
  return new Set(incidents.map((i) => i.title)).size;
}

/**
 * Audience events for the projector charts: one fetch + live inserts. If the database
 * can't be reached the charts simply don't render — the incident list below carries the
 * error state, and this view never shows demo data as if it were the room.
 */
function useAudienceEvents(): KairosEvent[] | null {
  const [events, setEvents] = useState<KairosEvent[] | null>(null);
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    supabase
      .from("events")
      .select("id, created_at, sensor, actor, target, source, action, risk, level, verdict, reason, mitre, incident_id")
      .eq("source", "audience")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setEvents((list) => data.filter(isKairosEvent).reduce((acc, e) => addEvent(acc, e), list ?? []));
      });
    const channel = supabase
      .channel("audience-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, (payload) => {
        if (cancelled || !isKairosEvent(payload.new)) return;
        const row = payload.new;
        if (row.source === "audience") setEvents((list) => addEvent(list ?? [], row));
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);
  return events;
}

const FAMILY_COLORS = {
  "Trick the AI": "text-accent",
  "Password guessing": "text-muted",
  "Fake boss": "text-atlas-ink",
} as const;

/** Projector charts: attacks per minute by severity, and the attack-type mix. */
function AudienceCharts({ events, incidents }: { events: KairosEvent[] | null; incidents: Incident[] }) {
  const now = useMinuteClock();
  const buckets = useMemo(() => (now ? minuteBuckets(events ?? [], 15, now) : []), [events, now]);
  const totals = useMemo(() => {
    const t: Record<Level, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const b of buckets) for (const l of Object.keys(t) as Level[]) t[l] += b.counts[l];
    return t;
  }, [buckets]);
  // Attack mix from the MITRE tags the console actually has (the picker's choice never
  // reaches it): T1110.* password guessing, T1656/T1534 fake boss, AML.T0051.* trick the AI.
  const mix = useMemo(() => {
    const counts = new Map<keyof typeof FAMILY_COLORS, number>();
    for (const i of incidents) {
      for (const tag of i.mitre) {
        const family = attackFamily(tag.technique_id);
        if (family) counts.set(family, (counts.get(family) ?? 0) + 1);
      }
    }
    return (Object.keys(FAMILY_COLORS) as Array<keyof typeof FAMILY_COLORS>).map((f) => ({
      key: f,
      label: f,
      value: counts.get(f) ?? 0,
      colorClass: FAMILY_COLORS[f],
    }));
  }, [incidents]);

  const hasActivity = buckets.some((b) => b.total > 0);
  const hasMix = mix.some((m) => m.value > 0);
  if (!hasActivity && !hasMix) return null;

  return (
    <div className="grid items-stretch gap-3 sm:gap-4 min-[900px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      {hasActivity && (
        <Panel title="Attacks per minute" meta={<span>audience · last 15 min</span>}>
          <StackedColumns buckets={buckets} className="h-28" />
          <LevelLegend counts={totals} className="mt-3 text-base" />
        </Panel>
      )}
      {hasMix && (
        <Panel title="Attack mix" meta={<span>from MITRE techniques</span>}>
          <Donut size={116} centerLabel="tagged" data={mix} className="[&_dl]:text-base" />
        </Panel>
      )}
    </div>
  );
}

export function AudienceView() {
  const { api } = useAuth();
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const events = useAudienceEvents();

  const load = () => {
    api<Incident[]>("/incidents")
      .then((list) => {
        setIncidents(sortIncidents(list.filter((i) => i.source === "audience")));
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  };
  useEffect(load, [api]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("audience-incidents")
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, (payload) => {
        const incident = asIncident(payload.new);
        if (incident && incident.source === "audience") setIncidents((list) => upsertIncident(list ?? [], incident));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (error) return <ErrorState title="Couldn't load the audience view" message={error} onRetry={load} />;
  if (!incidents) return <LoadingState label="Loading audience attacks" lines={5} />;

  return (
    <section aria-label="Audience attacks" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h1 className="text-3xl sm:text-4xl">Audience attacks</h1>
        {incidents.length > 0 && (
          <p className="text-lg text-ink-2">
            <span className="num font-semibold text-ink">{attackerCount(incidents)}</span> attacker
            {attackerCount(incidents) === 1 ? "" : "s"} on the finance agent
          </p>
        )}
      </div>

      <AudienceCharts events={events} incidents={incidents} />

      {incidents.length === 0 ? (
        <EmptyState
          title="No audience attacks yet"
          description="Scan the QR code and launch an attack. Incidents from the audience appear here as they happen."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {incidents.map((i) => (
            <li
              key={i.id}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 rounded-card border border-rule bg-paper px-5 py-4 shadow-card"
            >
              <span className="font-display text-5xl font-semibold leading-none num text-ink sm:text-6xl">{i.risk}</span>
              <span className="min-w-0">
                <span className="block truncate text-xl font-medium sm:text-2xl">{i.title}</span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-lg">
                  <LevelBadge level={i.level} className="text-base" />
                  <span className="text-ink-2">{STATUS_LABELS[i.status] ?? i.status}</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
