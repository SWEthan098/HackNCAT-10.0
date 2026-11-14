// OWNER: Jordan (P4). Phone approval page. STUB.
// TODO(Jordan): Realtime listener on approvals, loud sound + full-screen red alert,
// Approve / Deny calling POST /approvals/{id}/approve|deny, keep the screen awake.

import { Disclaimer } from "@/components/kairos/Disclaimer";
import { PageHeader } from "@/components/layout/AppShell";

export default function ApprovePage() {
  return (
    <>
      <PageHeader title="Approvals" description="Waiting for containment requests." />
      <Disclaimer />
    </>
  );
}
