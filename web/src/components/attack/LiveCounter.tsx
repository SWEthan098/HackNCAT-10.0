"use client";

// Live "N attacks · N stopped · N breaches" from public_feed (anon read + Realtime). If it
// can't load, it says so. It never shows a made-up number: breaches come ONLY from a real
// boolean `breach` column (feature-detected per load; until Daylen's column lands the segment
// is omitted), never inferred from layers_reached.

import { useEffect, useState } from "react";
import { FEED_SCAN_LIMIT, type FeedCounts, counterText, feedCounts } from "@/lib/attack";
import { createClient } from "@/lib/supabase/client";

type Counter = { status: "loading" } | { status: "live"; counts: FeedCounts } | { status: "unavailable" };

function useLiveCounter(): Counter {
  const [state, setState] = useState<Counter>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      // Missing public env vars: the counter is unavailable, the rest of the page works.
      queueMicrotask(() => !cancelled && setState({ status: "unavailable" }));
      return () => {
        cancelled = true;
      };
    }

    // Counts come from the database every time (never incremented locally), so a re-delivered
    // Realtime insert can't inflate the number.
    const load = async () => {
      // select("*") so the rows themselves say which columns exist: the breaches segment
      // appears automatically once the `breach` column lands. The exact count keeps the
      // attacks total right even if the row scan were ever capped.
      const { data, error, count } = await supabase.from("public_feed").select("*", { count: "exact" }).limit(FEED_SCAN_LIMIT);
      if (cancelled) return;
      if (error || !data || count === null) {
        // Keep real numbers we already showed; only an unloaded counter becomes unavailable.
        setState((s) => (s.status === "live" ? s : { status: "unavailable" }));
        return;
      }
      setState({ status: "live", counts: feedCounts(data, count) });
    };

    const channel = supabase
      .channel("attack-public-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "public_feed" }, () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(load, 300);
      })
      .subscribe();

    load().catch(() => !cancelled && setState((s) => (s.status === "live" ? s : { status: "unavailable" })));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  return state;
}

export function LiveCounter() {
  const state = useLiveCounter();
  return (
    <p className="flex min-h-11 items-center gap-2.5 text-base" role="status">
      {state.status === "live" ? (
        <>
          <span className="atk-live-dot" aria-hidden="true" />
          <span className="num font-medium">{counterText(state.counts)}</span>
          <span className="visually-hidden">so far, updating live</span>
        </>
      ) : state.status === "loading" ? (
        <span className="atk-muted">Counting attacks so far…</span>
      ) : (
        <span className="atk-muted">The live attack count is unavailable right now.</span>
      )}
    </p>
  );
}
