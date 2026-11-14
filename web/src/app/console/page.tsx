"use client";

// OWNER: Jordan (P4). Defender Console home: KPI strip, incident queue, live event stream.
// From 900px the stream is pinned beside the queue (half of a 1080p screen still fits both);
// below that it follows the queue.

import { Suspense } from "react";
import { IncidentQueue } from "@/components/kairos/IncidentQueue";
import { KpiStrip } from "@/components/kairos/KpiStrip";
import { LiveEventFeed } from "@/components/kairos/LiveEventFeed";
import { LoadingState } from "@/components/ui";

export default function ConsolePage() {
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <h1 className="visually-hidden">Incidents</h1>
      <KpiStrip />
      <div className="grid items-start gap-3 sm:gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_clamp(19rem,30vw,25rem)]">
        {/* Suspense: the queue reads its filters from the URL (useSearchParams). */}
        <Suspense fallback={<LoadingState label="Loading incidents" lines={4} />}>
          <IncidentQueue />
        </Suspense>
        <LiveEventFeed className="min-[900px]:sticky min-[900px]:top-[4.25rem] min-[900px]:max-h-[calc(100dvh-7rem)]" />
      </div>
    </div>
  );
}
