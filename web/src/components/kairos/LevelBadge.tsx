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

const LEVEL_LABELS: Record<Level, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

/** "Critical 85" chip. Pass `risk` wherever the score is known. */
export function LevelBadge({ level, risk, className }: { level: Level; risk?: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[var(--radius-pill)] px-2 py-0.5 text-xs font-medium",
        LEVEL_CLASSES[level],
        className,
      )}
    >
      {LEVEL_LABELS[level]}
      {typeof risk === "number" && <span className="num">{risk}</span>}
    </span>
  );
}
