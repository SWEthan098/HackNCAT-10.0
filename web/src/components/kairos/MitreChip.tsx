// MITRE technique chip. ATT&CK and ATLAS get different looks (docs/PLAN.md § 11): ATT&CK on
// the cobalt wash, ATLAS on graphite. IDs come from the backend's frozen table, never a model.

import { cn } from "@/components/ui";
import type { MitreTag } from "@/lib/types/kairos";

export function MitreChip({ tag, className }: { tag: MitreTag; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-baseline gap-1.5 whitespace-nowrap rounded-input px-2 py-0.5 text-xs",
        tag.framework === "ATLAS" ? "bg-graphite text-graphite-ink" : "bg-accent-wash text-accent-deep",
        className,
      )}
      title={`${tag.framework} · ${tag.tactic}`}
    >
      <span className="num font-mono">{tag.technique_id}</span>
      <span className="truncate font-medium">{tag.name}</span>
    </span>
  );
}
