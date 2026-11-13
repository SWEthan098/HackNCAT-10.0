"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeader } from "@/components/layout/AppShell";
import { IconBook, IconKey, IconPulse, IconSpark, IconUser, NavCard, NavCardGrid } from "@/components/ui";
import { API_URL } from "@/lib/api";
import { ROUTES } from "@/lib/routes";

// The signature object of this starter: route cards that go to working screens.
// When the challenge arrives, add a card per feature here (and to NAV_ITEMS in AppShell).
export default function DashboardPage() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="Overview" description={user?.email ? `Signed in as ${user.email}.` : undefined} />
      <NavCardGrid>
        <NavCard
          href={ROUTES.profile}
          icon={<IconUser />}
          title="Profile"
          description="Your account details and display name, stored in the profiles table."
        />
        <NavCard
          href={ROUTES.system}
          icon={<IconPulse />}
          title="System status"
          description="Live checks of the API, database, your session and the AI provider."
        />
        <NavCard
          href={ROUTES.ai}
          icon={<IconSpark />}
          title="AI playground"
          description="Send a prompt through the backend's provider-neutral AI service."
        />
        <NavCard
          href={ROUTES.resetPassword}
          icon={<IconKey />}
          title="Change password"
          description="Choose a new password for this account."
        />
        <NavCard
          href={`${API_URL}/docs`}
          external
          icon={<IconBook />}
          title="API docs"
          description="Interactive Swagger docs for the FastAPI backend (development only)."
        />
      </NavCardGrid>
    </>
  );
}
