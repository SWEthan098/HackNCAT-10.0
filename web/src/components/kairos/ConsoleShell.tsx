"use client";

// OWNER: Jordan (P4). The frame around every Defender Console page: graphite top bar (wordmark,
// section tabs, kill switch, account menu), the page content, and the disclaimer bar.
// Sized to work at half of a 1080p screen (about 960px) next to the Red Team Console.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useCallback, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { wordmarkClasses } from "@/components/layout/Wordmark";
import { cn } from "@/components/ui";
import { CONSOLE_SECTIONS, ROUTES, isConsoleSectionActive } from "@/lib/routes";
import type { OkResponse } from "@/lib/types/kairos";
import { DISCLAIMER_TEXT } from "./Disclaimer";
import { KillSwitch } from "./KillSwitch";

/** The section tabs. `pathname` is null while it is not known yet (no tab is marked current). */
function ConsoleTabs({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Console sections"
      className="order-3 -mx-1 flex h-11 w-full overflow-x-auto border-t border-graphite-2 sm:order-none sm:mx-0 sm:h-14 sm:w-auto sm:border-t-0"
    >
      {CONSOLE_SECTIONS.map((item) => {
        const active = pathname !== null && isConsoleSectionActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-full shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm no-underline",
              // Not transition-colors: that also fades the focus ring in, and a ring must appear at once.
              "transition-[color,background-color,border-color] focus-visible:-outline-offset-2 active:bg-graphite-2",
              active ? "border-accent-2 text-graphite-ink" : "border-transparent text-graphite-muted hover:text-graphite-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function CurrentConsoleTabs() {
  return <ConsoleTabs pathname={usePathname()} />;
}

/**
 * The frame itself, with no data or session wiring, so it can be rendered anywhere.
 * `killSwitch` and `account` fill the right side of the top bar.
 */
export function ConsoleFrame({ killSwitch, account, children }: { killSwitch: ReactNode; account: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <a
        href="#main"
        className="on-paper sr-only rounded-input bg-paper px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[600]"
      >
        Skip to content
      </a>
      <header className="on-graphite sticky top-0 z-[300]">
        <div className="mx-auto flex w-full max-w-[var(--container)] flex-wrap items-center gap-x-4 px-4 sm:gap-x-6 sm:px-6">
          <Link href={ROUTES.console} aria-label="Kairos Defender Console, incidents" className="flex h-14 shrink-0 items-center gap-3 no-underline">
            <span className={wordmarkClasses}>Kairos</span>
            <span className="hidden text-sm text-graphite-muted sm:inline">Defender Console</span>
          </Link>
          {/* usePathname can't be known while prerendering a page with a dynamic segment
              (/console/incidents/[id]); without this boundary that page would fail to build. */}
          <Suspense fallback={<ConsoleTabs pathname={null} />}>
            <CurrentConsoleTabs />
          </Suspense>
          <div className="ml-auto flex h-14 items-center gap-2 sm:gap-3">
            {killSwitch}
            {account}
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[var(--container)] flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
      <footer className="z-[200] border-t border-rule bg-paper-2 sm:sticky sm:bottom-0">
        <p className="mx-auto w-full max-w-[var(--container)] px-4 py-1.5 text-xs text-muted sm:px-6">{DISCLAIMER_TEXT}</p>
      </footer>
    </div>
  );
}

/** ConsoleFrame wired to the signed-in user: the kill switch calls the API as them. */
export function ConsoleShell({ children }: { children: ReactNode }) {
  const { api } = useAuth();

  const freezeAllAgents = useCallback(async () => {
    const res = await api<OkResponse>("/killswitch", { method: "POST" });
    if (!res.ok) throw new Error(res.detail ?? "The API did not confirm the freeze.");
  }, [api]);

  return (
    <ConsoleFrame killSwitch={<KillSwitch onFreeze={freezeAllAgents} />} account={<AccountMenu tone="graphite" emailFrom="xl" />}>
      {children}
    </ConsoleFrame>
  );
}
