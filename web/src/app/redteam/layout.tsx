// OWNER: Miles (P2). Only this folder in web/ is Miles's.
import type { ReactNode } from "react";
import { AuthedShell } from "@/components/kairos/AuthedShell";

export default function Layout({ children }: { children: ReactNode }) {
  return <AuthedShell>{children}</AuthedShell>;
}
