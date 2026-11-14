import { KairosMark, Wordmark } from "@/components/layout/Wordmark";
import { DISCLAIMER_TEXT } from "@/components/kairos/Disclaimer";
import { ButtonLink } from "@/components/ui";
import { ROUTES } from "@/lib/routes";

// OWNER: Jordan (P4). Public landing page: what Kairos is and the one way in. Demo
// accounts are provisioned by the team, so there is no public sign-up path.
export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <span className="flex items-center gap-2">
          <KairosMark />
          <Wordmark />
        </span>
        <ButtonLink href={ROUTES.login} variant="ghost" size="sm">
          Log in
        </ButtonLink>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 pb-24 sm:px-6">
        <h1 className="text-3xl sm:text-[2.5rem]">Kairos sees the whole attack.</h1>
        <p className="lead mt-4 max-w-[52ch] text-ink-2">
          Three listeners, one incident story, a human on every big call.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href={ROUTES.console} size="lg">
            Open the console
          </ButtonLink>
        </div>
      </main>
      <footer className="mx-auto w-full max-w-6xl px-4 pb-5 sm:px-6">
        <p className="border-t border-rule pt-4 text-xs text-muted">{DISCLAIMER_TEXT}</p>
      </footer>
    </div>
  );
}
