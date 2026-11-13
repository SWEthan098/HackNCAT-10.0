"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ConfirmDialog, Dropdown, IconChevronDown, IconKey, IconUser, Skeleton, cn } from "@/components/ui";
import { ROUTES } from "@/lib/routes";
import { Wordmark } from "./Wordmark";

export const NAV_ITEMS = [
  { href: ROUTES.dashboard, label: "Overview" },
  { href: ROUTES.profile, label: "Profile" },
  { href: ROUTES.system, label: "System" },
  { href: ROUTES.ai, label: "AI" },
];

function isActive(pathname: string, href: string) {
  return href === ROUTES.dashboard ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** Top bar shell for signed-in screens. Links wrap into a second row under 40rem. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();
  const [confirmOut, setConfirmOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <a href="#main" className="sr-only rounded-input bg-paper px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[600]">
        Skip to content
      </a>
      <header className="sticky top-0 z-[300] border-b border-rule bg-paper/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 sm:px-6">
          <Wordmark href={ROUTES.dashboard} />
          <nav aria-label="Main" className="order-3 -mx-2 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-input px-2.5 py-1.5 text-sm no-underline transition-colors",
                    active ? "bg-accent-wash text-accent-deep" : "text-ink-2 hover:bg-paper-2 hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto">
            {loading || !user ? (
              <Skeleton className="h-8 w-40" />
            ) : (
              <Dropdown
                triggerLabel="Account menu"
                trigger={
                  <>
                    <IconUser size={18} />
                    <span className="hidden max-w-48 truncate sm:inline" data-testid="user-email">
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
            )}
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
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
    </div>
  );
}

/** Page heading row used at the top of each signed-in screen. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1>{title}</h1>
        {description && <p className="mt-2 max-w-[65ch] text-ink-2">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
