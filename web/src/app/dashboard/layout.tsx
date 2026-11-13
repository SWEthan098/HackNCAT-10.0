import { AuthProvider } from "@/components/auth/AuthProvider";
import { AppShell } from "@/components/layout/AppShell";

// Every /dashboard/* route is protected on the server by src/proxy.ts before it renders.
export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}
