// Formatting for analyst answers (chat drawer + the incident summary). The analyst's text is
// built from attacker-influenced evidence, so it NEVER goes through a markdown renderer or
// dangerouslySetInnerHTML: we only split plain text into blocks and recognize a fixed set of
// section labels. The only links ever built from an answer come from validated MITRE ids
// (classifyCitation, fixed hosts). OWNER: Jordan (P4).
//
// Format v2 (confirmed by the backend owner): blocks are separated by blank lines, and a
// block's FIRST line may start with one of the six labels. Later lines of the same block are
// wrapped prose, not new sections, so they join with a space.

import { type Citation, classifyCitation } from "@/lib/incidents";

/** Section labels the analyst uses. A block's first line must start with one, exactly. */
export const ANALYST_LABELS = [
  "What happened:",
  "Why it matters:",
  "Next step:",
  "Triage:",
  "MITRE:",
  "Evidence:",
] as const;

export type AnswerBlock = {
  /** One of ANALYST_LABELS (rendered bold), or null for a plain paragraph. */
  label: string | null;
  /** The block's text after the label. On a MITRE: block, whatever wasn't a valid technique id. */
  text: string;
  /** Validated MITRE technique ids from a "MITRE:" block, rendered as chips. */
  mitre: Citation[];
};

/**
 * Split an analyst answer into renderable blocks: blank lines separate blocks, a single
 * newline inside a block is wrapped prose (joined with a space, never a new section), and
 * only a block's first line can carry a label. On a "MITRE:" block, tokens that validate as
 * ATT&CK/ATLAS ids become chips (deduped, a trailing period tolerated); anything else in the
 * block stays plain text, never a link.
 */
export function parseAnalystAnswer(answer: string): AnswerBlock[] {
  // Group non-blank lines into blocks (a whitespace-only line is blank).
  const groups: string[][] = [];
  let current: string[] = [];
  for (const raw of answer.split("\n")) {
    const line = raw.trim();
    if (!line) {
      if (current.length > 0) groups.push(current);
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) groups.push(current);

  const blocks: AnswerBlock[] = [];
  for (const [first, ...more] of groups) {
    const label = ANALYST_LABELS.find((l) => first.startsWith(l)) ?? null;
    const head = label ? first.slice(label.length).trim() : first;
    const text = [head, ...more].filter(Boolean).join(" ");
    if (label !== "MITRE:") {
      blocks.push({ label, text, mitre: [] });
      continue;
    }
    const mitre: Citation[] = [];
    const leftover: string[] = [];
    for (const token of text.split(/[\s,;]+/)) {
      if (!token) continue;
      // A sentence-ending period after an id is not part of the id.
      const cite = classifyCitation(token.replace(/\.+$/, ""));
      if (cite.kind === "event") leftover.push(token);
      else if (!mitre.some((m) => m.raw === cite.raw)) mitre.push(cite);
    }
    blocks.push({ label, text: leftover.join(" "), mitre });
  }
  return blocks;
}

/**
 * Compact labels for the event-id citations the analyst sent alongside an answer: the first
 * distinct event id becomes "E1", the next "E2", … in order of appearance (the same id always
 * gets the same label). MITRE ids are not event citations and get no entry. The full event id
 * stays available for tooltips; the label is display only and never becomes a link — a bare
 * event id has no page of its own to honestly link to.
 */
export function labelEventCitations(citations: readonly string[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const raw of citations) {
    const cite = classifyCitation(raw);
    if (cite.kind !== "event") continue;
    if (!labels.has(cite.raw)) labels.set(cite.raw, `E${labels.size + 1}`);
  }
  return labels;
}
