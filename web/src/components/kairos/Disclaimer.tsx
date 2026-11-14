/** The one sentence every Kairos page must show. Change it here only. */
export const DISCLAIMER_TEXT = "Fictional demo environment. Not affiliated with or endorsed by Cisco.";

/**
 * Required on every console page and the audience page. Pages inside the Defender Console get it
 * from the ConsoleShell footer, so they must not add this as well.
 */
export function Disclaimer() {
  return <p className="mt-10 border-t border-rule pt-4 text-xs text-muted">{DISCLAIMER_TEXT}</p>;
}
