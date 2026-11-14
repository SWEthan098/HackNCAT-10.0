// OWNER: Jordan (P4). Incident status chip, shared by the queue and the incident page.

import { cn } from "@/components/ui";
import { STATUS_LABELS } from "@/lib/incidents";
import type { Incident } from "@/lib/types/kairos";

/** Status chips: what needs a person reads loudest; finished work steps back. */
const STATUS_TONES: Record<Incident["status"], string> = {
  new: "bg-accent-wash text-accent-deep",
  investigating: "bg-paper-3 text-ink",
  awaiting_approval: "bg-level-high-wash text-level-high-ink",
  contained: "text-success ring-1 ring-inset ring-success/45",
  closed: "text-muted ring-1 ring-inset ring-rule-2",
  false_positive: "text-muted ring-1 ring-inset ring-rule-2",
};

export function StatusChip({ status, className }: { status: Incident["status"]; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-[3px] px-1.5 py-0.5 text-[0.8125rem] font-medium leading-tight",
        STATUS_TONES[status] ?? "bg-paper-3 text-ink",
        className,
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

