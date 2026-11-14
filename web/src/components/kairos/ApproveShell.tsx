"use client";

// OWNER: Jordan (P4). Slim frame for the approver's phone: wordmark, account menu, page,
// and the Cisco disclaimer. No console tabs: on a phone the only job here is deciding.

import Link from "next/link";
import type { ReactNode } from "react";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { KairosLockup } from "@/components/layout/Wordmark";
import { ROUTES } from "@/lib/routes";
import { DISCLAIMER_TEXT } from "./Disclaimer";

export function ApproveShell({ children }: { children: ReactNode }) {
  return (
    <div data-theme="soc" className="flex min-h-full flex-1 flex-col bg-paper text-ink">
      <header className="on-graphite sticky top-0 z-[300] border-b border-rule">
        <div className="mx-auto flex h-12 w-full max-w-lg items-center justify-between gap-3 px-4">
          <Link href={ROUTES.approve} className="flex items-center gap-2.5 no-underline" aria-label="Kairos approvals">
            <KairosLockup sub="Approvals" subAlways />
          </Link>
          <AccountMenu tone="graphite" emailFrom="xl" />
        </div>
      </header>
      <main id="main" className="w-full flex-1 px-4 py-5">
        {children}
      </main>
      <footer className="on-graphite border-t border-rule">
        <p className="mx-auto w-full max-w-lg px-4 py-2 text-xs text-graphite-muted">{DISCLAIMER_TEXT}</p>
      </footer>
    </div>
  );
}
