import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ConsoleShell } from "@/components/kairos/ConsoleShell";

export const metadata: Metadata = {
  title: { absolute: "Kairos Defender Console", template: "%s | Kairos Defender Console" },
};

/** Every /console page sits inside the Defender Console shell (routes are guarded in proxy.ts). */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ConsoleShell>{children}</ConsoleShell>
    </AuthProvider>
  );
}
