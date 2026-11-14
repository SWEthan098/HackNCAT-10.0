"use client";

// OWNER: Jordan (P4). The frame around every Defender Console page: graphite top bar (wordmark,
// section tabs, kill switch, account menu), the page content, and the disclaimer bar.
// Sized to work at half of a 1080p screen (about 960px) next to the Red Team Console.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useCallback, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { KairosLockup } from "@/components/layout/Wordmark";
import { cn } from "@/components/ui";
import { CONSOLE_SECTIONS, ROUTES, isConsoleSectionActive } from "@/lib/routes";
import type { OkResponse } from "@/lib/types/kairos";
import { DISCLAIMER_TEXT } from "./Disclaimer";
import { AnalystDrawer } from "./AnalystDrawer";
import { KillSwitch } from "./KillSwitch";
import { ApprovalsNavLink, PendingApprovalsBanner, usePendingApprovals } from "./PendingApprovals";

/** The section tabs. `pathname` is null while it is not known yet (no tab is marked current). */
function ConsoleTabs({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Console sections"
      className="order-3 -mx-4 flex h-10 w-[calc(100%+2rem)] overflow-x-auto border-t border-graphite-2 px-2 sm:order-none sm:mx-0 sm:h-12 sm:w-auto sm:border-t-0 sm:px-0"
    >
      {CONSOLE_SECTIONS.map((item) => {
        const active = pathname !== null && isConsoleSectionActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex h-full shrink-0 items-center whitespace-nowrap px-3 text-[0.9375rem] no-underline",
              // The active marker is a bar on the bottom edge, drawn inside the tab.
              "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full",
              // Not transition-colors: that also fades the focus ring in, and a ring must appear at once.
              "transition-[color,background-color] focus-visible:-outline-offset-2 hover:bg-graphite-2/60 active:bg-graphite-2",
              active ? "font-medium text-graphite-ink after:bg-accent-2" : "text-graphite-muted hover:text-graphite-ink",
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
 * `killSwitch` and `account` fill the right side of the top bar; `approvals` is the
 * Approvals link + badge (approver-role accounts only) and `banner` sits at the top of
 * the page content, where it can never cover the kill switch or the nav.
 */
export function ConsoleFrame({
  killSwitch,
  account,
  approvals,
  banner,
  children,
}: {
  killSwitch: ReactNode;
  account: ReactNode;
  approvals?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div data-theme="soc" className="flex min-h-full flex-1 flex-col bg-paper text-ink">
      <a
        href="#main"
        className="on-paper sr-only rounded-input bg-paper px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[600]"
      >
        Skip to content
      </a>
      <header className="on-graphite sticky top-0 z-[300] border-b border-rule">
        <div className="flex w-full flex-wrap items-center gap-x-3 px-4 sm:gap-x-5 sm:px-5">
          <Link
            href={ROUTES.console}
            aria-label="Kairos Defender Console, incidents"
            className="flex h-12 shrink-0 items-center gap-2.5 no-underline focus-visible:-outline-offset-2"
          >
            <KairosLockup sub="Defender Console" />
          </Link>
          {/* usePathname can't be known while prerendering a page with a dynamic segment
              (/console/incidents/[id]); without this boundary that page would fail to build. */}
          <Suspense fallback={<ConsoleTabs pathname={null} />}>
            <CurrentConsoleTabs />
          </Suspense>
          <div className="ml-auto flex h-12 items-center gap-2 sm:gap-3">
            {approvals}
            <span className="hidden sm:inline-flex">
              <AnalystDrawer />
            </span>
            {killSwitch}
            {account}
          </div>
        </div>
      </header>
      <main id="main" className="w-full flex-1 px-3 py-4 sm:px-5 sm:py-5">
        {banner}
        {children}
      </main>
      <footer className="on-graphite z-[200] border-t border-rule sm:sticky sm:bottom-0">
        <p className="w-full px-4 py-1.5 text-xs text-graphite-muted sm:px-5">{DISCLAIMER_TEXT}</p>
      </footer>
    </div>
  );
}

/** ConsoleFrame wired to the signed-in user: the kill switch calls the API as them. */
export function ConsoleShell({ children }: { children: ReactNode }) {
  const { api, roles } = useAuth();

  // Only approver-role accounts get the Approvals link, badge and banner. red_team can't
  // reach the console anyway (roleRedirect), but the guard keeps the rule in one place.
  const isApprover = (roles?.includes("approver") ?? false) && !(roles?.includes("red_team") ?? false);
  const pending = usePendingApprovals(isApprover);

  const freezeAllAgents = useCallback(async () => {
    const res = await api<OkResponse>("/killswitch", { method: "POST" });
    if (!res.ok) throw new Error(res.detail ?? "The API did not confirm the freeze.");
  }, [api]);

  return (
    <ConsoleFrame
      killSwitch={<KillSwitch onFreeze={freezeAllAgents} />}
      account={<AccountMenu tone="graphite" emailFrom="xl" />}
      approvals={isApprover ? <ApprovalsNavLink pending={pending} /> : null}
      banner={isApprover ? <PendingApprovalsBanner pending={pending} /> : null}
    >
      {children}
    </ConsoleFrame>
  );
}
