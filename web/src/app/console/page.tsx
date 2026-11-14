"use client";

// OWNER: Jordan (P4). Defender Console home: KPI strip, incident queue, live event stream.

import { Suspense } from "react";
import { IncidentQueue } from "@/components/kairos/IncidentQueue";
import { KpiStrip } from "@/components/kairos/KpiStrip";
import { LiveEventFeed } from "@/components/kairos/LiveEventFeed";
import { PageHeader } from "@/components/layout/AppShell";
import { LoadingState } from "@/components/ui";

export default function ConsolePage() {
  return (
    <>
      <PageHeader title="Incidents" />
      <div className="mb-6">
        <KpiStrip />
      </div>
      {/* Suspense: the queue reads its filters from the URL (useSearchParams). */}
      <Suspense fallback={<LoadingState label="Loading incidents" lines={4} />}>
        <IncidentQueue />
      </Suspense>
      <div className="mt-10">
        <LiveEventFeed />
      </div>
    </>
  );
}
