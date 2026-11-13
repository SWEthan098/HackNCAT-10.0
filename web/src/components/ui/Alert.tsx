import type { ReactNode } from "react";
import { cn } from "./cn";
import { IconAlert, IconCheck, IconInfo } from "./Icons";

type Tone = "info" | "success" | "error";

const tones: Record<Tone, { box: string; icon: ReactNode }> = {
  info: { box: "border-rule-2 bg-paper-2 text-ink", icon: <IconInfo size={18} className="text-accent" /> },
  success: { box: "border-success/40 bg-paper text-ink", icon: <IconCheck size={18} className="text-success" /> },
  error: { box: "border-error/50 bg-paper text-ink", icon: <IconAlert size={18} className="text-error" /> },
};

/**
 * Inline notification tied to the thing it is about (a form, a panel). Errors use
 * role="alert" so screen readers announce them; others are polite status messages.
 */
export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const t = tones[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-input border px-3 py-2.5 text-sm", t.box, className)}
    >
      <span className="mt-0.5 shrink-0">{t.icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && "mt-0.5 text-ink-2")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
