"use client";

// Live "N attacks, 0 breaches" from public_feed (anon read + Realtime). If it can't load, it
// says so. It never shows a made-up number.

import { useEffect, useState } from "react";
import { BREACH_LAYERS, counterText } from "@/lib/attack";
import { createClient } from "@/lib/supabase/client";

type Counter = { status: "loading" } | { status: "live"; attacks: number; breaches: number } | { status: "unavailable" };

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
      const [all, breaches] = await Promise.all([
        supabase.from("public_feed").select("id", { count: "exact", head: true }),
        supabase.from("public_feed").select("id", { count: "exact", head: true }).gte("layers_reached", BREACH_LAYERS),
      ]);
      if (cancelled) return;
      if (all.error || breaches.error || all.count === null || breaches.count === null) {
        // Keep real numbers we already showed; only an unloaded counter becomes unavailable.
        setState((s) => (s.status === "live" ? s : { status: "unavailable" }));
        return;
      }
      setState({ status: "live", attacks: all.count, breaches: breaches.count });
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
          <span className="num font-medium">{counterText(state.attacks, state.breaches)}</span>
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
