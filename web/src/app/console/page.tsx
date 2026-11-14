"use client";

// OWNER: Jordan (P4). Kairos Defender Console. STUB: lists incidents from the stub API.
// TODO(Jordan): KPI strip (/stats), level badges, source filter, audience view for the projector,
// incident detail at /console/incidents/[id], live updates via Supabase Realtime.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Disclaimer } from "@/components/kairos/Disclaimer";
import { PageHeader } from "@/components/layout/AppShell";
import { ErrorState, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import type { Incident } from "@/lib/types/kairos";

export default function ConsolePage() {
  const { api } = useAuth();
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Incident[]>("/incidents")
      .then(setIncidents)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, [api]);

  return (
    <>
      <PageHeader title="Kairos Defender Console" description="Incidents, sorted by risk." />
      {error ? (
        <ErrorState title="Couldn't load incidents" message={error} />
      ) : !incidents ? (
        <LoadingState label="Loading incidents" />
      ) : (
        <ul className="flex flex-col gap-2">
          {incidents.map((i) => (
            <li key={i.id} className="rounded-card border border-rule bg-paper px-4 py-3">
              <Link href={`/console/incidents/${i.id}`} className="font-medium">
                {i.title}
              </Link>
              <p className="mt-1 text-sm text-muted">
                {i.level.toUpperCase()} {i.risk} · {i.status.replace("_", " ")} · {i.source}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Disclaimer />
    </>
  );
}
