// OWNER: Jordan (P4). Incident detail page (checklist step 7).

import type { Metadata } from "next";
import { Suspense } from "react";
import { IncidentDetailView } from "@/components/kairos/IncidentDetail";
import { LoadingState } from "@/components/ui";

export const metadata: Metadata = { title: "Incident" };

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IncidentDetailView id={id} />;
}

export default function IncidentPage({ params }: PageProps<"/console/incidents/[id]">) {
  return (
    <Suspense fallback={<LoadingState label="Loading incident" lines={6} />}>
      <Detail params={params} />
    </Suspense>
  );
}
