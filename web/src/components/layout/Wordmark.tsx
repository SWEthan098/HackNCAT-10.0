import Link from "next/link";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="font-display text-lg font-semibold tracking-[var(--tracking-display)] text-ink no-underline">
      Kairos
    </Link>
  );
}
