import Link from "next/link";

/** The Kairos wordmark's type, without a colour, so a bar on another surface can reuse it. */
export const wordmarkClasses = "font-display text-lg font-semibold tracking-[var(--tracking-display)]";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className={`${wordmarkClasses} text-ink no-underline`}>
      Kairos
    </Link>
  );
}
