// OWNER: Jordan (P4). Audit log + Verify Integrity (checklist step 13).

import type { Metadata } from "next";
import { AuditLog } from "@/components/kairos/AuditLog";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditLogPage() {
  return <AuditLog />;
}
