"use client";

// OWNER: Jordan (P4). Defender Console home: KPI band, charts row, incident queue, live
// event stream. The page owns the one live event stream (useLiveEvents) and shares it with
// the KPI sparkline, the charts and the feed, so every panel shows the same session and a
// Realtime hiccup degrades them together, honestly. From 900px the right rail is pinned
// beside the queue (half of a 1080p screen still fits both); below that it follows.

import { Suspense } from "react";
import { ChartsRow, TopTechniques } from "@/components/kairos/ChartsRow";
import { IncidentQueue } from "@/components/kairos/IncidentQueue";
import { KpiStrip } from "@/components/kairos/KpiStrip";
import { LiveEventFeed, useLiveEvents } from "@/components/kairos/LiveEventFeed";
import { LoadingState } from "@/components/ui";

export default function ConsolePage() {
  const live = useLiveEvents();
  const demo = live.status === "demo";
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <h1 className="visually-hidden">Incidents</h1>
      <KpiStrip events={live.events} />
      <ChartsRow events={live.events} demo={demo} />
      <div className="grid items-start gap-3 sm:gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_clamp(19rem,30vw,25rem)]">
        {/* Suspense: the queue reads its filters from the URL (useSearchParams). */}
        <Suspense fallback={<LoadingState label="Loading incidents" lines={4} />}>
          <IncidentQueue />
        </Suspense>
        <div className="flex min-w-0 flex-col gap-3 sm:gap-4 min-[900px]:sticky min-[900px]:top-[4.25rem] min-[900px]:max-h-[calc(100dvh-7rem)]">
          <TopTechniques events={live.events} demo={demo} />
          <LiveEventFeed live={live} className="min-h-0 flex-1" />
        </div>
      </div>
    </div>
  );
}
