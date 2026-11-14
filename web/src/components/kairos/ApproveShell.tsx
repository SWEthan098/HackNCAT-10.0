"use client";

// OWNER: Jordan (P4). Slim frame for the approver's phone: wordmark, account menu, page,
// and the Cisco disclaimer. No console tabs: on a phone the only job here is deciding.

import Link from "next/link";
import type { ReactNode } from "react";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { wordmarkClasses } from "@/components/layout/Wordmark";
import { ROUTES } from "@/lib/routes";
import { DISCLAIMER_TEXT } from "./Disclaimer";

export function ApproveShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="on-graphite sticky top-0 z-[300]">
        <div className="mx-auto flex h-14 w-full max-w-lg items-center justify-between gap-3 px-4">
          <Link href={ROUTES.approve} className="flex items-center gap-2 no-underline" aria-label="Kairos approvals">
            <span className={wordmarkClasses}>Kairos</span>
            <span className="text-sm text-graphite-muted">Approvals</span>
          </Link>
          <AccountMenu tone="graphite" emailFrom="xl" />
        </div>
      </header>
      <main id="main" className="w-full flex-1 px-4 py-6">
        {children}
      </main>
      <footer className="border-t border-rule bg-paper-2">
        <p className="mx-auto w-full max-w-lg px-4 py-2 text-xs text-muted">{DISCLAIMER_TEXT}</p>
      </footer>
    </div>
  );
}
