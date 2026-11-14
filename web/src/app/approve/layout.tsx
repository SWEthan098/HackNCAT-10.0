import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ApproveShell } from "@/components/kairos/ApproveShell";

export const metadata: Metadata = { title: { absolute: "Kairos Approvals" } };

/** The approver's phone (routes are guarded in proxy.ts). */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ApproveShell>{children}</ApproveShell>
    </AuthProvider>
  );
}
