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
import { Button, EmptyState, ErrorState, IconChevronRight, LoadingState, cn, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { asIncident, filterIncidents, sortIncidents, upsertIncident } from "@/lib/incidents";
import { createClient } from "@/lib/supabase/client";
import type { Appeal, Incident, Source } from "@/lib/types/kairos";
import { LEVEL_INK, LEVEL_LABELS } from "./LevelBadge";
import { MitreChip } from "./MitreChip";
import { Panel } from "./Panel";
import { StatusChip } from "./StatusChip";

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
        className={cn(
          "relative grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-3 py-3 pl-4 pr-3.5 no-underline sm:grid-cols-[4rem_minmax(0,1fr)_7.5rem_5.5rem] sm:pr-4",
          "transition-colors focus-visible:-outline-offset-2",
          // Severity wash only on Critical rows: the one row allowed to shout (Figma B theme).
          incident.level === "critical" ? "bg-level-critical-wash/45 hover:bg-level-critical-wash/70" : "hover:bg-paper-3",
          // The level edge: the first thing the eye catches when scanning the queue.
          "before:absolute before:inset-y-0 before:left-0 before:w-1",
          LEVEL_EDGE[incident.level],
        )}
      >
        <span className="flex flex-col items-start">
          <span className={cn("num font-display text-[1.75rem] font-semibold leading-none", LEVEL_INK[incident.level])}>{incident.risk}</span>
          <span className={cn("mt-1 text-xs font-medium", LEVEL_INK[incident.level])}>{LEVEL_LABELS[incident.level]}</span>
        </span>
        <span className="min-w-0">
          <span className="line-clamp-2 text-[0.96875rem] font-medium leading-snug text-ink">{incident.title}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-ink-2">
            <span className="sm:hidden">
              <StatusChip status={incident.status} />
            </span>
            <span className="text-muted">{incident.source === "audience" ? "Audience attacker" : "Scripted chain"}</span>
            <span className="num font-mono text-[0.8125rem] text-muted sm:hidden">
              {new Date(incident.created_at).toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit" })}
            </span>
            {topTechnique && <MitreChip tag={topTechnique} />}
          </span>
        </span>
        <span className="hidden pt-0.5 sm:flex">
          <StatusChip status={incident.status} />
        </span>
        <span className="hidden items-center gap-1.5 pt-0.5 sm:flex">
          <span className="num font-mono text-[0.8125rem] text-muted">
            {new Date(incident.created_at).toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit" })}
          </span>
          <IconChevronRight size={16} className="text-muted" />
        </span>
      </Link>
    </li>
  );
}

const LEVEL_EDGE: Record<Incident["level"], string> = {
  low: "before:bg-level-low",
  medium: "before:bg-level-medium",
  high: "before:bg-level-high",
  critical: "before:bg-level-critical",
};

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

  const filters = (
    <>
      <div role="group" aria-label="Source filter" className="flex rounded-input bg-paper p-0.5 ring-1 ring-inset ring-rule">
        {SOURCES.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={source === s.value}
            onClick={() => setFilter("source", s.value === "all" ? null : s.value)}
            className={cn(
              "rounded-[3px] px-2.5 py-1 text-sm transition-colors",
              source === s.value ? "bg-paper-3 font-medium text-ink" : "text-muted hover:text-ink",
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
          appealsOnly ? "border-accent bg-accent-wash font-medium text-accent-deep" : "border-rule text-muted hover:bg-paper-3 hover:text-ink",
        )}
      >
        With appeals
      </button>
    </>
  );

  return (
    <Panel
      title="Incident queue"
      meta={visible ? <span className="num">{visible.length === 1 ? "1 incident" : `${visible.length} incidents`}{visible.length > 1 && ", highest risk first"}</span> : undefined}
      actions={filters}
      bodyClassName={visible && visible.length > 0 && !error && !(appealsOnly && appealsError) ? "p-0" : "p-3.5 sm:p-4"}
    >
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
        <>
          {/* Column heads (the rows carry the real labels; this is the table's scan line). */}
          <div
            aria-hidden
            className="hidden gap-x-3 border-b border-rule pb-1.5 pl-4 pr-3.5 pt-2 text-xs text-muted sm:grid sm:grid-cols-[4rem_minmax(0,1fr)_7.5rem_5.5rem] sm:pr-4"
          >
            <span>Risk</span>
            <span>Incident</span>
            <span>Status</span>
            <span>Time</span>
          </div>
          <ul className="flex flex-col divide-y divide-rule">
            {visible.map((i) => (
              <IncidentRow key={i.id} incident={i} />
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
