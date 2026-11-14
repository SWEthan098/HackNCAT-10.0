// OWNER: Jordan (P4). The console's one container: a titled panel with a hairline header.
// Panels sit edge to edge in the console grid; they are never nested inside each other.

import type { ReactNode } from "react";
import { cn } from "@/components/ui";

export function Panel({
  title,
  label,
  meta,
  actions,
  children,
  className,
  bodyClassName,
  headingLevel = 2,
}: {
  title: ReactNode;
  /** Accessible name for the section when `title` is not plain text. */
  label?: string;
  /** Quiet text next to the title (a count, a live status). */
  meta?: ReactNode;
  /** Controls on the right of the header row. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section
      aria-label={label ?? (typeof title === "string" ? title : undefined)}
      className={cn("flex min-w-0 flex-col overflow-hidden rounded-card border border-rule bg-paper-2", className)}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule px-3.5 py-2.5 sm:px-4">
        <Heading className="max-w-none text-[1.0625rem] leading-tight">{title}</Heading>
        {meta && <div className="flex items-center gap-1.5 text-sm text-muted">{meta}</div>}
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={cn("min-w-0 flex-1", bodyClassName ?? "px-3.5 py-3 sm:px-4")}>{children}</div>
    </section>
  );
}
