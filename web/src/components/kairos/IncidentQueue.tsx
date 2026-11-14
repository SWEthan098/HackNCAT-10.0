"use client";

// OWNER: Jordan (P4). Incident queue (checklist step 6): sorted by score, level badges,
// status, source filter, appeals filter, top MITRE technique, live updates + toast on a
// new incident. Titles and summaries can quote attacker text: plain text rendering only.
//
// TODO(Jordan -> Daylen): the Incident contract has no per-listener field, so the queue
// can't show listener icons yet. Smallest fix: add `sensors: Sensor[]` to Incident in
// api/schemas/kairos.py + types/kairos.ts in one PR.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button, EmptyState, ErrorState, LoadingState, cn, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { STATUS_LABELS, asIncident, filterIncidents, sortIncidents, upsertIncident } from "@/lib/incidents";
import { createClient } from "@/lib/supabase/client";
import type { Appeal, Incident, Source } from "@/lib/types/kairos";
import { LevelBadge } from "./LevelBadge";
import { MitreChip } from "./MitreChip";

const SOURCES: Array<{ value: Source | "all"; label: string }> = [
  { value: "all", label: "All sources" },
  { value: "scripted", label: "Scripted" },
  { value: "audience", label: "Audience" },
];

function IncidentRow({ incident }: { incident: Incident }) {
  const topTechnique = incident.mitre[0];
  return (
    <li>
      <Link
        href={`/console/incidents/${incident.id}`}
        className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 rounded-card border border-rule bg-paper px-4 py-3 no-underline shadow-card transition-colors hover:border-rule-2 hover:bg-paper-2"
      >
        <LevelBadge level={incident.level} risk={incident.risk} className="mt-0.5" />
        <span className="min-w-0">
          <span className="block truncate font-medium text-ink">{incident.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
            <span>{STATUS_LABELS[incident.status] ?? incident.status}</span>
            <span className="text-muted">{incident.source === "audience" ? "Audience attacker" : "Scripted chain"}</span>
            <span className="num text-xs text-muted">
              {new Date(incident.created_at).toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit" })}
            </span>
            {topTechnique && <MitreChip tag={topTechnique} />}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function IncidentQueue() {
  const { api } = useAuth();
  const { notify } = useToast();
  const router = useRouter();
  const params = useSearchParams();

  // Filters live in the URL so a filtered view survives reload and can be shared.
  const source = (SOURCES.find((s) => s.value === params.get("source"))?.value ?? "all") as Source | "all";
  const appealsOnly = params.get("appeals") === "1";

  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appealIds, setAppealIds] = useState<ReadonlySet<string> | null>(null);
  const [appealsError, setAppealsError] = useState(false);
  const toastedIds = useRef<Set<string>>(new Set());

  const setFilter = (key: "source" | "appeals", value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    router.replace(next.size ? `?${next}` : "/console", { scroll: false });
  };

  const load = useCallback(() => {
    api<Incident[]>("/incidents")
      .then((list) => {
        setIncidents((prev) => sortIncidents([...list.filter((i) => !prev?.some((p) => p.id === i.id)), ...(prev ?? [])]));
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, [api]);
  useEffect(load, [load]);

  // Live inserts and status changes; a toast only for incidents this tab hasn't seen.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("incident-queue")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "incidents" }, (payload) => {
        const incident = asIncident(payload.new);
        if (!incident) return;
        setIncidents((list) => upsertIncident(list ?? [], incident));
        if (!toastedIds.current.has(incident.id)) {
          toastedIds.current.add(incident.id);
          notify(`New incident: ${incident.title}`, incident.level === "critical" || incident.level === "high" ? "error" : "info");
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "incidents" }, (payload) => {
        const incident = asIncident(payload.new);
        if (incident) setIncidents((list) => upsertIncident(list ?? [], incident));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [notify]);

  // Appeal ids are only needed while the appeals filter is on.
  useEffect(() => {
    if (!appealsOnly || appealIds !== null) return;
    let cancelled = false;
    api<Appeal[]>("/appeals")
      .then((list) => {
        if (cancelled) return;
        setAppealIds(new Set(list.filter((a) => a.status === "open" && a.incident_id).map((a) => a.incident_id as string)));
        setAppealsError(false);
      })
      .catch(() => !cancelled && setAppealsError(true));
    return () => {
      cancelled = true;
    };
  }, [api, appealsOnly, appealIds]);

  const visible = incidents
    ? filterIncidents(incidents, { source, appealsOnly, appealIncidentIds: appealIds ?? new Set() })
    : null;
  const filtered = source !== "all" || appealsOnly;

  return (
    <section aria-label="Incident queue">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Source filter" className="flex rounded-input bg-paper-3 p-0.5">
          {SOURCES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={source === s.value}
              onClick={() => setFilter("source", s.value === "all" ? null : s.value)}
              className={cn(
                "rounded-[5px] px-2.5 py-1 text-sm transition-colors",
                source === s.value ? "bg-paper font-medium text-ink shadow-card" : "text-ink-2 hover:text-ink",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={appealsOnly}
          onClick={() => setFilter("appeals", appealsOnly ? null : "1")}
          className={cn(
            "rounded-input border px-2.5 py-1 text-sm transition-colors",
            appealsOnly ? "border-accent-2 bg-accent-wash font-medium text-accent-deep" : "border-rule text-ink-2 hover:bg-paper-2 hover:text-ink",
          )}
        >
          With appeals
        </button>
      </div>

      {error ? (
        <ErrorState title="Couldn't load incidents" message={error} onRetry={load} />
      ) : !visible ? (
        <LoadingState label="Loading incidents" lines={4} />
      ) : appealsOnly && appealsError ? (
        <ErrorState title="Couldn't load appeals" message="The appeals list didn't load, so this filter can't run." onRetry={() => {
              setAppealsError(false);
              setAppealIds(null);
            }} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={filtered ? "No incidents match these filters" : "No incidents yet"}
          description={
            filtered
              ? "Clear the filters to see the whole queue."
              : "When events from different listeners link together, the incident appears here."
          }
          action={
            filtered ? (
              <Button variant="secondary" size="sm" onClick={() => router.replace("/console", { scroll: false })}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((i) => (
            <IncidentRow key={i.id} incident={i} />
          ))}
        </ul>
      )}
    </section>
  );
}
