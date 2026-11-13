import type { ReactNode } from "react";
import { cn } from "./cn";

/** The one surface recipe: paper, hairline rule, small shadow. Never nest a Card in a Card. */
export function Card({ className, children, as: As = "section" }: { className?: string; children: ReactNode; as?: "section" | "div" | "article" }) {
  return <As className={cn("rounded-card border border-rule bg-paper shadow-card", className)}>{children}</As>;
}

/** A dashboard panel: a title row (with optional actions) over a body. */
export function DashboardCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-lg">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className="flex-1 px-5 py-4">{children}</div>
    </Card>
  );
}

/** A single figure and its label, in tabular numerals. Only for real values. */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm text-muted">{label}</span>
      <span className="num font-display text-xl text-ink">{value}</span>
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </div>
  );
}
