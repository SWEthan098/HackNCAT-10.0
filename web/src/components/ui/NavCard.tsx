import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { IconChevronRight, IconExternal } from "./Icons";

/**
 * A navigation card: the whole card is one link to a real route.
 *
 * Built to the Hallmark skill's app-screen rules (see docs/HALLMARK.md):
 * - one focusable element (the link) with an instant :focus-visible ring;
 * - hover is one signal (1px lift + border step) and only on hover-capable devices;
 * - press sinks 1px; transform/colour only, never `transition: all`;
 * - the chevron sits in its own slot, never glued to the text; the icon is aria-hidden;
 * - `status` is plain text (no coloured dot), and is only shown when it is real.
 */
export function NavCard({
  href,
  title,
  description,
  icon,
  status,
  external = false,
  className,
}: {
  href: string;
  title: string;
  description: string;
  icon?: ReactNode;
  status?: ReactNode;
  external?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {icon && (
        <span className="grid size-10 shrink-0 place-items-center rounded-input border border-rule bg-paper-2 text-accent">
          {icon}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-display text-lg font-medium text-ink">{title}</span>
        <span className="text-sm text-ink-2">{description}</span>
        {status && <span className="mt-1 text-sm text-muted">{status}</span>}
      </span>
      <span className="self-center text-muted transition-colors group-hover:text-accent">
        {external ? <IconExternal size={18} /> : <IconChevronRight size={18} />}
      </span>
    </>
  );
  const classes = cn(
    "group flex items-start gap-4 rounded-card border border-rule bg-paper p-5 text-left no-underline shadow-card",
    "transition-[transform,border-color,background-color] duration-[var(--dur-micro)] ease-[var(--ease-out)]",
    "hover:-translate-y-px hover:border-rule-2 hover:bg-paper-2 active:translate-y-px",
    className,
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={classes}>
        {body}
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>
    );
  }
  return (
    <Link href={href} className={classes}>
      {body}
    </Link>
  );
}

/** Responsive grid for NavCards: 1 column on phones, 2 on tablets, 3 on wide screens. */
export function NavCardGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3", className)}>{children}</div>;
}
