"use client";

// OWNER: Jordan (P4). Live event stream (checklist step 4): new events appear without a
// refresh via Supabase Realtime. If the live database can't be reached, the feed switches
// to clearly-labelled demo data instead of pretending (honest offline state).
//
// All event text (actor, target, reason) is attacker-controlled: it is rendered as plain
// text only. No markdown, no images, no links.

import { useEffect, useRef, useState } from "react";
import { Button, EmptyState, IconPulse, LoadingState } from "@/components/ui";
import { addEvent, demoEvent, isKairosEvent } from "@/lib/liveEvents";
import { createClient } from "@/lib/supabase/client";
import type { KairosEvent, Sensor } from "@/lib/types/kairos";
import { LevelBadge } from "./LevelBadge";

const SENSOR_LABELS: Record<Sensor, string> = {
  login_guard: "Login Guard",
  comms_guard: "Comms Guard",
  agent_firewall: "Agent Firewall",
};

type Status = "connecting" | "live" | "reconnecting" | "demo";

function useLiveEvents() {
  const [events, setEvents] = useState<KairosEvent[] | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [attempt, setAttempt] = useState(0);
  // Demo data must NEVER mix into a feed that has shown real rows: an analyst (or a judge)
  // could mistake fake attacks for real ones. Once a real row or a reachable database is
  // seen, a Realtime hiccup shows "Reconnecting" and keeps the real rows instead.
  const sawRealData = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let demoTimer: number | undefined;
    let demoCount = 0;
    // The channel often settles before the first fetch answers, so a channel failure only
    // flags trouble; the fetch outcome decides between "reconnecting" (DB fine, channel
    // down) and demo data (DB unreachable).
    let fetchOutcome: "pending" | "ok" | "failed" = "pending";
    let channelDown = false;

    const startDemo = () => {
      if (cancelled || demoTimer !== undefined || sawRealData.current) return;
      setStatus("demo");
      const now = new Date();
      setEvents([2, 1, 0].reduce((list, n) => addEvent(list, demoEvent(n, now)), [] as KairosEvent[]));
      demoCount = 3;
      demoTimer = window.setInterval(() => {
        setEvents((list) => addEvent(list ?? [], demoEvent(demoCount++)));
      }, 5000);
    };

    const channel = supabase
      .channel("live-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, (payload) => {
        if (!cancelled && isKairosEvent(payload.new)) {
          const row = payload.new;
          sawRealData.current = true;
          setEvents((list) => addEvent(list ?? [], row));
        }
      })
      .subscribe((state) => {
        if (cancelled) return;
        if (state === "SUBSCRIBED") {
          channelDown = false;
          setStatus((s) => (s === "demo" ? s : "live"));
        }
        if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
          channelDown = true;
          if (fetchOutcome === "ok") setStatus((s) => (s === "demo" ? s : "reconnecting"));
          else if (fetchOutcome === "failed") startDemo();
          // pending: the fetch outcome decides
        }
      });

    supabase
      .from("events")
      .select("id, created_at, sensor, actor, target, source, action, risk, level, verdict, reason, mitre, incident_id")
      .order("created_at", { ascending: false })
      .limit(25)
      .then(({ data, error }) => {
        if (cancelled || demoTimer !== undefined) return;
        if (error || !data) {
          fetchOutcome = "failed";
          return startDemo();
        }
        fetchOutcome = "ok";
        sawRealData.current = true;
        if (channelDown) setStatus((s) => (s === "demo" ? s : "reconnecting"));
        setEvents((list) => {
          // Realtime rows may already be in the list; merge, then newest first.
          const merged = data.filter(isKairosEvent).reduce((acc, e) => addEvent(acc, e), list ?? []);
          return [...merged].sort((a, b) => b.created_at.localeCompare(a.created_at));
        });
      });

    return () => {
      cancelled = true;
      if (demoTimer !== undefined) window.clearInterval(demoTimer);
      supabase.removeChannel(channel);
    };
  }, [attempt]);

  return {
    events,
    status,
    retry: () => {
      sawRealData.current = false;
      setEvents(null);
      setStatus("connecting");
      setAttempt((n) => n + 1);
    },
  };
}

function EventRow({ event }: { event: KairosEvent }) {
  const technique = event.mitre[0]?.technique_id;
  return (
    <li className="grid grid-cols-[auto_auto_1fr] items-baseline gap-x-3 gap-y-1 border-b border-rule px-1 py-2.5 last:border-b-0">
      <span className="num text-xs text-muted">{new Date(event.created_at).toLocaleTimeString(undefined, { hour12: false })}</span>
      <LevelBadge level={event.level} risk={event.risk} />
      <div className="min-w-0">
        <p className="text-sm">
          <span className="text-muted">{SENSOR_LABELS[event.sensor] ?? event.sensor}</span>{" "}
          <span className="font-medium">
            {event.actor} → {event.target}
          </span>{" "}
          <span className={event.verdict === "blocked" ? "font-medium text-error" : "text-ink-2"}>{event.verdict}</span>
          {technique && <span className="ml-2 font-mono text-xs text-muted">{technique}</span>}
        </p>
        <p className="mt-0.5 text-sm text-ink-2">{event.reason}</p>
      </div>
    </li>
  );
}

export function LiveEventFeed() {
  const { events, status, retry } = useLiveEvents();
  // The screen-reader announcement and the visible label stay one thing.
  const statusLabel =
    status === "live" ? "Live" : status === "demo" ? "Demo data" : status === "reconnecting" ? "Reconnecting…" : "Connecting…";

  return (
    <section aria-label="Live events">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>Live events</h2>
        <p className="flex items-center gap-1.5 text-sm text-muted" role="status">
          <IconPulse size={16} className={status === "live" ? "text-accent" : undefined} />
          {statusLabel}
        </p>
      </div>
      {status === "demo" && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-input border border-rule bg-paper-2 px-3 py-2">
          <p className="text-sm text-ink-2">Can&apos;t reach the live database, so this shows demo data. Nothing here is real.</p>
          <Button variant="secondary" size="sm" onClick={retry}>
            Try live again
          </Button>
        </div>
      )}
      {!events ? (
        <LoadingState className="mt-4" label="Connecting to the event stream" />
      ) : events.length === 0 ? (
        <EmptyState
          className="mt-4"
          title="No events yet"
          description="The three listeners write events here the moment they see something. Run an attack from the Red Team console to make one."
        />
      ) : (
        <ul role="log" aria-label="Live events, newest first" className="mt-2">
          {events.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </ul>
      )}
    </section>
  );
}
