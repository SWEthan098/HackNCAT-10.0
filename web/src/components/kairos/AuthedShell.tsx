import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { AppShell } from "@/components/layout/AppShell";

/** Signed-in layout shared by /console, /approve and /redteam (routes are guarded in proxy.ts). */
export function AuthedShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}
