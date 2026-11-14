// Renders an analyst answer as structured plain text: blocks split on blank lines, the fixed
// section labels in bold, and a MITRE: block's validated technique ids as chips (same tones
// as MitreChip) linking to the official MITRE page. Everything else is a text node — the
// answer can quote attacker text, so no markdown, no dangerouslySetInnerHTML, and no link
// that isn't built from a validated id. OWNER: Jordan (P4).

import { IconExternal, cn } from "@/components/ui";
import { parseAnalystAnswer } from "@/lib/analystText";
import type { Citation } from "@/lib/incidents";

function MitreIdChip({ cite }: { cite: Citation }) {
  const cls = cn(
    "inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 font-mono text-[0.75rem] font-medium leading-tight",
    cite.kind === "atlas" ? "bg-atlas-wash text-atlas-ink ring-1 ring-inset ring-atlas-ink/45" : "bg-attack-wash text-attack-ink",
  );
  if (!cite.href) {
    return <span className={cls}>{cite.raw}</span>;
  }
  return (
    <a
      href={cite.href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(cls, "no-underline transition-opacity hover:opacity-85")}
      aria-label={`${cite.raw}, opens the MITRE page in a new tab`}
    >
      {cite.raw}
      <IconExternal size={11} className="shrink-0 opacity-70" />
    </a>
  );
}

/** An analyst answer: section labels bold, MITRE ids as chips, everything a text node. */
export function AnalystAnswer({ text, className }: { text: string; className?: string }) {
  const blocks = parseAnalystAnswer(text);
  if (blocks.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {blocks.map((block, i) => (
        <p key={i}>
          {block.label && <strong className="font-semibold">{block.label}</strong>}
          {block.label && (block.text || block.mitre.length > 0) ? " " : null}
          {block.mitre.length > 0 && (
            <span className="inline-flex max-w-full flex-wrap items-center gap-1.5 align-bottom">
              {block.mitre.map((m) => (
                <MitreIdChip key={m.raw} cite={m} />
              ))}
            </span>
          )}
          {block.mitre.length > 0 && block.text ? " " : null}
          {block.text}
        </p>
      ))}
    </div>
  );
}
