// MITRE technique chip. ATT&CK and ATLAS get different looks (docs/PLAN.md § 11): ATT&CK on
// the cobalt wash, ATLAS on graphite. IDs come from the backend's frozen table, never a model.

import { IconExternal, cn } from "@/components/ui";
import { mitreUrl } from "@/lib/incidents";
import type { MitreTag } from "@/lib/types/kairos";

const FRAMEWORK_NAMES = { ATTACK: "ATT&CK", ATLAS: "ATLAS" } as const;

/**
 * `linked` turns the chip into a link to the official MITRE page. The URL is built from a
 * validated id (lib/incidents.mitreUrl); an id that doesn't validate stays a plain chip.
 */
export function MitreChip({ tag, linked = false, className }: { tag: MitreTag; linked?: boolean; className?: string }) {
  const tone = tag.framework === "ATLAS" ? "bg-graphite text-graphite-ink" : "bg-accent-wash text-accent-deep";
  const body = (
    <>
      <span className="num font-mono">{tag.technique_id}</span>
      <span className="truncate font-medium">{tag.name}</span>
    </>
  );
  const base = "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-input px-2 py-0.5 text-xs";
  const href = linked ? mitreUrl(tag) : null;

  if (!href) {
    return (
      <span className={cn(base, tone, className)} title={`${FRAMEWORK_NAMES[tag.framework]}: ${tag.tactic}`}>
        {body}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(base, tone, "no-underline transition-opacity hover:opacity-85", className)}
      aria-label={`${tag.technique_id} ${tag.name}, ${FRAMEWORK_NAMES[tag.framework]} ${tag.tactic}. Opens the MITRE page in a new tab.`}
    >
      {body}
      <IconExternal size={12} className="shrink-0 opacity-70" />
    </a>
  );
}
