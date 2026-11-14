"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ConfirmDialog, Dropdown, IconChevronDown, IconKey, IconUser, Skeleton, cn } from "@/components/ui";
import { ROUTES } from "@/lib/routes";

// Static class names so Tailwind can see them.
const EMAIL_FROM = { sm: "sm:inline", xl: "xl:inline" } as const;

/**
 * Account menu for any signed-in top bar: who is signed in, profile, change password, log out
 * (with a confirmation). `tone` is the surface the trigger sits on; `emailFrom` is the breakpoint
 * where the email shows next to the icon (the menu always names the account).
 */
export function AccountMenu({ tone = "paper", emailFrom = "sm" }: { tone?: "paper" | "graphite"; emailFrom?: keyof typeof EMAIL_FROM }) {
  const { user, loading, signOut } = useAuth();
  const [confirmOut, setConfirmOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (loading || !user) {
    return tone === "graphite" ? (
      <div aria-hidden className="h-8 w-12 rounded-input bg-graphite-2" />
    ) : (
      <Skeleton className="h-8 w-40" />
    );
  }

  return (
    <>
      <Dropdown
        tone={tone}
        triggerLabel="Account menu"
        trigger={
          <>
            <IconUser size={18} />
            <span className={cn("hidden max-w-48 truncate", EMAIL_FROM[emailFrom])} data-testid="user-email">
              {user.email}
            </span>
            <IconChevronDown size={16} />
          </>
        }
        items={[
          { type: "label", label: `Signed in as ${user.email}` },
          { type: "link", label: "Profile", href: ROUTES.profile, icon: <IconUser size={16} /> },
          { type: "link", label: "Change password", href: ROUTES.resetPassword, icon: <IconKey size={16} /> },
          { type: "action", label: "Log out", danger: true, onSelect: () => setConfirmOut(true) },
        ]}
      />
      <ConfirmDialog
        open={confirmOut}
        title="Log out?"
        description="You'll need your email and password to sign back in."
        confirmLabel="Log out"
        loading={signingOut}
        onCancel={() => setConfirmOut(false)}
        onConfirm={async () => {
          setSigningOut(true);
          await signOut();
        }}
      />
    </>
  );
}
