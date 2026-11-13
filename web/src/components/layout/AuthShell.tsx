import type { ReactNode } from "react";
import { Wordmark } from "./Wordmark";

/** Centered single-panel layout for login, sign-up and password screens. */
export function AuthShell({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-paper-2">
      <header className="px-4 py-4 sm:px-6">
        <Wordmark />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm rounded-card border border-rule bg-paper p-6 shadow-card sm:p-8">
          <h1 className="text-2xl">{title}</h1>
          {description && <p className="mt-2 text-sm text-ink-2">{description}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 border-t border-rule pt-4 text-sm text-ink-2">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
