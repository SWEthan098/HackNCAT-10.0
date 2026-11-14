// OWNER: Jordan (P4). Audit log with Verify Integrity (checklist step 13). PLACEHOLDER.
// TODO(Jordan): every decision in order + a Verify Integrity button (GET /audit/verify) that
// shows "Chain verified".

import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/AppShell";
import { ButtonLink, EmptyState } from "@/components/ui";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditLogPage() {
  return (
    <>
      <PageHeader title="Audit log" description="Every decision Kairos and its operators made, in order." />
      <EmptyState
        title="The audit log is not built yet"
        description="Each decision will be listed here, with a check that no entry has been changed."
        action={
          <ButtonLink href={ROUTES.console} variant="secondary" size="sm">
            Open incidents
          </ButtonLink>
        }
      />
    </>
  );
}
