// Risk level badge: Low gray, Medium yellow, High orange, Critical red (docs/PLAN.md § 12).
// Colour never stands alone: the label always says the level, and usually the score.

import { cn } from "@/components/ui";
import type { Level } from "@/lib/types/kairos";

const LEVEL_CLASSES: Record<Level, string> = {
  low: "bg-paper-3 text-ink-2",
  medium: "bg-level-medium-wash text-level-medium-ink",
  high: "bg-level-high-wash text-level-high-ink",
  critical: "bg-level-critical-wash text-level-critical-ink",
};

/** Solid level colour, for edges, bars and markers (always next to a label that names the level). */
export const LEVEL_SIGNAL: Record<Level, string> = {
  low: "bg-level-low",
  medium: "bg-level-medium",
  high: "bg-level-high",
  critical: "bg-level-critical",
};

/** Level-coloured text that keeps AA contrast on the console surfaces. */
export const LEVEL_INK: Record<Level, string> = {
  low: "text-ink-2",
  medium: "text-level-medium-ink",
  high: "text-level-high-ink",
  critical: "text-level-critical-ink",
};

export const LEVEL_LABELS: Record<Level, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

/**
 * "Critical 85" chip. Pass `risk` wherever the score is known. With `children` the badge
 * shows "Critical <children>" instead (e.g. a count in the KPI strip).
 */
export function LevelBadge({
  level,
  risk,
  className,
  children,
}: {
  level: Level;
  risk?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[3px] px-1.5 py-0.5 text-[0.8125rem] font-medium leading-tight",
        LEVEL_CLASSES[level],
        className,
      )}
    >
      <span aria-hidden className={cn("size-2 shrink-0 rounded-[1px]", LEVEL_SIGNAL[level])} />
      {LEVEL_LABELS[level]}
      {typeof risk === "number" && <span className="num font-semibold">{risk}</span>}
      {children !== undefined && <span className="num font-semibold">{children}</span>}
    </span>
  );
}
