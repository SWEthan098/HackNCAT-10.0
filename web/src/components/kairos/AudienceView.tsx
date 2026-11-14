"use client";

// OWNER: Jordan (P4). Audience view for the projector (checklist step 12): the incident queue
// filtered to source = audience, in big type readable from the back of the room, live via
// Realtime. Titles can quote attacker text, so everything renders as plain text.

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { STATUS_LABELS, asIncident, sortIncidents, upsertIncident } from "@/lib/incidents";
import { createClient } from "@/lib/supabase/client";
import type { Incident } from "@/lib/types/kairos";
import { LevelBadge } from "./LevelBadge";

/** Distinct audience attackers behind the incidents (campaign card: "N attackers"). */
function attackerCount(incidents: Incident[]): number {
  return new Set(incidents.map((i) => i.title)).size;
}

export function AudienceView() {
  const { api } = useAuth();
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
