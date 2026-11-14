// The response ladder: Kairos answers in proportion (watched, slowed, challenged, blocked).
// Idle it explains the scale; on a result it lights up to the level Kairos chose.

import { RESPONSE_COPY, RESPONSE_LADDER, ladderIndex, type ResponseLevel } from "@/lib/attack";

export function ResponseLadder({ level }: { level?: ResponseLevel }) {
  const at = level ? ladderIndex(level) : -1;
  return (
    <ol
      className="atk-ladder"
      data-mode={level ? "result" : "idle"}
      aria-label={level ? `Response level: ${RESPONSE_COPY[level].label}, step ${at + 1} of 4` : "Response levels, from mildest to strongest"}
    >
      {RESPONSE_LADDER.map((step, i) => (
        <li
          key={step}
          data-step={step}
          data-state={!level ? "idle" : i === at ? "current" : i < at ? "below" : "off"}
          aria-current={i === at ? "step" : undefined}
        >
          <span className="atk-ladder-bar" aria-hidden="true" />
          <span className="atk-ladder-label">{RESPONSE_COPY[step].label}</span>
        </li>
      ))}
    </ol>
  );
}
