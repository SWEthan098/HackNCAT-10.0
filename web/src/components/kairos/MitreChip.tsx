// MITRE technique chip. ATT&CK and ATLAS get different looks (docs/PLAN.md § 11): ATT&CK is a
// solid cobalt chip, ATLAS a violet chip with a ring, so they differ in hue AND in shape.
// IDs come from the backend's frozen table, never a model.

import { IconExternal, cn } from "@/components/ui";
import { mitreUrl } from "@/lib/incidents";
import type { MitreTag } from "@/lib/types/kairos";

const FRAMEWORK_NAMES = { ATTACK: "ATT&CK", ATLAS: "ATLAS" } as const;

/**
 * `linked` turns the chip into a link to the official MITRE page. The URL is built from a
 * validated id (lib/incidents.mitreUrl); an id that doesn't validate stays a plain chip.
 */
export function MitreChip({
  tag,
  linked = false,
  wrap = false,
  className,
}: {
  tag: MitreTag;
  linked?: boolean;
  /** Let a long technique name wrap instead of truncating (narrow columns). */
  wrap?: boolean;
  className?: string;
}) {
  const tone =
    tag.framework === "ATLAS"
      ? "bg-atlas-wash text-atlas-ink ring-1 ring-inset ring-atlas-ink/45"
      : "bg-attack-wash text-attack-ink";
  const body = (
    <>
      <span className="num font-mono text-[0.75rem] font-medium">{tag.technique_id}</span>
      <span className={wrap ? "order-2 min-w-0 basis-full font-medium" : "truncate font-medium"}>{tag.name}</span>
    </>
  );
  const base = cn(
    "inline-flex max-w-full gap-x-1.5 rounded-[3px] px-1.5 py-0.5 text-[0.8125rem] leading-tight",
    wrap ? "flex-wrap items-center gap-y-0.5 py-1" : "items-center whitespace-nowrap",
  );
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
      <IconExternal size={12} className="order-1 shrink-0 opacity-70" />
    </a>
  );
}
