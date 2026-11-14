import Link from "next/link";
import type { ReactNode } from "react";
import { DISCLAIMER_TEXT } from "@/components/kairos/Disclaimer";
import { KairosLockup } from "./Wordmark";

/** Single-panel layout for login, sign-up and password screens, in the console's SOC theme. */
export function AuthShell({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div data-theme="soc" className="flex min-h-full flex-1 flex-col bg-paper text-ink">
      <header className="on-graphite border-b border-rule">
        <div className="flex h-12 items-center px-4 sm:px-5">
          <Link href="/" className="flex items-center gap-2.5 no-underline" aria-label="Kairos home">
            <KairosLockup sub="Defender Console" />
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-8 sm:pt-[12vh]">
        <div className="w-full max-w-[26rem] rounded-card border border-rule border-t-2 border-t-accent bg-paper-2 p-5 sm:p-7">
          <h1 className="text-[1.75rem]">{title}</h1>
          {description && <p className="mt-1.5 text-[0.9375rem] text-ink-2">{description}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 border-t border-rule pt-4 text-sm text-ink-2">{footer}</div>}
        </div>
      </main>
      <footer className="on-graphite border-t border-rule">
        <p className="px-4 py-2 text-xs text-graphite-muted sm:px-5">{DISCLAIMER_TEXT}</p>
      </footer>
    </div>
  );
}
