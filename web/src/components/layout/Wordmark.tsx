import Link from "next/link";
import { cn } from "@/components/ui/cn";

/** The Kairos wordmark's type, without a colour, so a bar on another surface can reuse it. */
export const wordmarkClasses = "font-display text-lg font-semibold tracking-[var(--tracking-display)]";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className={`${wordmarkClasses} text-ink no-underline`}>
      Kairos
    </Link>
  );
}

/**
 * The Kairos mark: three rising signals and the red one they add up to ("three yellow alerts
 * become one red alarm"). Decorative; the wordmark next to it carries the name.
 */
export function KairosMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" width={20} height={20} className={cn("shrink-0 text-accent-2", className)}>
      <rect x="1" y="12" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.35" />
      <rect x="6" y="9" width="3" height="9" rx="0.5" fill="currentColor" opacity="0.55" />
      <rect x="11" y="6" width="3" height="12" rx="0.5" fill="currentColor" opacity="0.8" />
      <rect x="16" y="2" width="3" height="16" rx="0.5" className="fill-level-critical" />
    </svg>
  );
}

/**
 * Mark, wordmark and the product area ("Defender Console"), for the SOC-theme bars: the
 * name stacked over the area (Figma top-bar lockup), so the bar stays tight. Below 640px
 * the area label hides unless `subAlways`. Put it inside a link or heading.
 */
export function KairosLockup({ sub, subAlways = false }: { sub?: string; subAlways?: boolean }) {
  return (
    <>
      <KairosMark />
      <span className="flex flex-col justify-center gap-0.5">
        <span className="font-display text-[1.0625rem] font-bold leading-none tracking-[var(--tracking-display)]">Kairos</span>
        {sub && (
          <span className={cn("text-[0.6875rem] leading-none text-graphite-muted", subAlways ? "block" : "hidden sm:block")}>
            {sub}
          </span>
        )}
      </span>
    </>
  );
}
