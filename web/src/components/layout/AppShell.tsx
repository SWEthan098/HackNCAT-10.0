"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/components/ui";
import { ROUTES, canOpen, homeFor } from "@/lib/routes";
import { AccountMenu } from "./AccountMenu";
import { Wordmark } from "./Wordmark";

export const NAV_ITEMS = [
  { href: ROUTES.console, label: "Console" },
  { href: ROUTES.redteam, label: "Red Team" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Top bar shell for signed-in screens. Links wrap into a second row under 40rem. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { roles } = useAuth();
  // Links appear once roles are known, so a red_team account never flashes console links.
  const links = roles === null ? [] : NAV_ITEMS.filter((item) => canOpen(item.href, roles));

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <a href="#main" className="sr-only rounded-input bg-paper px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[600]">
        Skip to content
      </a>
      <header className="sticky top-0 z-[300] border-b border-rule bg-paper/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 sm:px-6">
          <Wordmark href={homeFor(roles ?? [])} />
          <nav aria-label="Main" className="order-3 -mx-2 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {links.map((item) => {
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
            <AccountMenu />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
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
