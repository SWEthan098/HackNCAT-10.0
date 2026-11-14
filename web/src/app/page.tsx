import { Wordmark } from "@/components/layout/Wordmark";
import { ButtonLink } from "@/components/ui";
import { ROUTES } from "@/lib/routes";

// Public landing page. Replace the copy once the challenge (and product name) is known.
export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Wordmark />
        <ButtonLink href={ROUTES.login} variant="ghost" size="sm">
          Log in
        </ButtonLink>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 pb-24 sm:px-6">
        <h1 className="text-3xl sm:text-[2.5rem]">Ready for the challenge brief.</h1>
        <p className="lead mt-4 text-ink-2">Accounts, a secure API and a swappable AI layer, already wired together.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href={ROUTES.signup} size="lg">
            Create an account
          </ButtonLink>
          <ButtonLink href={ROUTES.console} variant="secondary" size="lg">
            Open the console
          </ButtonLink>
        </div>
      </main>
    </div>
  );
}
