// OWNER: Jordan (P4). Audience view for the projector (checklist step 12). PLACEHOLDER.
// TODO(Jordan): incident queue filtered to source = audience, big text readable from the back of
// the room, optional campaign card.

import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/AppShell";
import { ButtonLink, EmptyState } from "@/components/ui";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Audience view" };

export default function AudienceViewPage() {
  return (
    <>
      <PageHeader title="Audience view" description="Attacks from the audience, sized for the projector." />
      <EmptyState
        title="The audience view is not built yet"
        description="Attacks launched from people's phones will show up here in large type as they arrive."
        action={
          <ButtonLink href={ROUTES.console} variant="secondary" size="sm">
            Open incidents
          </ButtonLink>
        }
      />
    </>
  );
}
