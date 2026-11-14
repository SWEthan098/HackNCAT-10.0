// OWNER: Jordan (P4). Audience view for the projector (checklist step 12).

import type { Metadata } from "next";
import { AudienceView } from "@/components/kairos/AudienceView";

export const metadata: Metadata = { title: "Audience view" };

export default function AudienceViewPage() {
  return <AudienceView />;
}
