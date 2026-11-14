import { KairosMark, Wordmark } from "@/components/layout/Wordmark";
import { DISCLAIMER_TEXT } from "@/components/kairos/Disclaimer";
import { LevelBadge } from "@/components/kairos/LevelBadge";
import { MitreChip } from "@/components/kairos/MitreChip";
import { SensorIcon } from "@/components/kairos/SensorIcon";
import { ButtonLink, cn } from "@/components/ui";
import { ROUTES } from "@/lib/routes";
import type { MitreTag, Sensor } from "@/lib/types/kairos";

// OWNER: Jordan (P4). Public landing page, built from the approved Figma design
// ("07 Landing" in the Kairos concept file): hero with the takeover-chain story,
// the correlation pitch, the three listeners, code-not-AI scoring and human
// approvals. Demo accounts are provisioned by the team, so there is no sign-up
// path, and every figure on the page is the canonical demo chain (45 + 50 + 55
// -> 85 Critical) — nothing invented.

const CHAIN: Array<{ actors: string; sensor: Sensor; label: string; verdict: "flagged" | "blocked"; risk: number }> = [
  { actors: "bot:203.0.113.7 → j.smith", sensor: "login_guard", label: "Login Guard", verdict: "flagged", risk: 45 },
  { actors: "fake-cfo@cisco.example → j.smith", sensor: "comms_guard", label: "Comms Guard", verdict: "flagged", risk: 50 },
  { actors: "j.smith → finance_agent", sensor: "agent_firewall", label: "Agent Firewall", verdict: "blocked", risk: 55 },
];

const CHAIN_TAGS: MitreTag[] = [
  { framework: "ATTACK", tactic: "Credential Access", technique_id: "T1110.004", name: "Credential Stuffing" },
  { framework: "ATTACK", tactic: "Initial Access", technique_id: "T1656", name: "Impersonation" },
  { framework: "ATLAS", tactic: "Execution", technique_id: "AML.T0051.001", name: "LLM Prompt Injection" },
];

const LISTENERS: Array<{ sensor: Sensor; name: string; text: string }> = [
  {
    sensor: "login_guard",
    name: "Login Guard",
    text: "Watches sign-in behaviour — timing and metadata only, never what anyone types. Raw login data is deleted after 24 hours.",
  },
  {
    sensor: "comms_guard",
    name: "Comms Guard",
    text: "Reads messages for phishing, impersonation and AI-written manipulation — and flags who is being pressured.",
  },
  {
    sensor: "agent_firewall",
    name: "Agent Firewall",
    text: "Sits between the company AI agent and its tools, checking every action against hard rules that never bend — even when the AI is fooled.",
  },
];

/** The published risk bands (engine.score_to_level), as flex shares of the 0-100 scale. */
const BANDS = [
  { label: "Low", range: "0–29", bar: "bg-level-low", ink: "text-ink-2", share: "30%" },
  { label: "Medium", range: "30–59", bar: "bg-level-medium", ink: "text-level-medium-ink", share: "30%" },
  { label: "High", range: "60–84", bar: "bg-level-high", ink: "text-level-high-ink", share: "25%" },
  { label: "Critical", range: "85–100", bar: "bg-level-critical", ink: "text-level-critical-ink", share: "15%" },
] as const;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="max-w-none font-display text-[1.75rem] font-semibold tracking-[var(--tracking-display)] sm:text-[2.25rem]">{children}</h2>;
}

/** The hero visual: the demo takeover chain collapsing into one Critical incident. */
function TakeoverChain() {
  return (
    <figure aria-label="Three events from one actor become a single Critical incident" className="m-0 flex w-full max-w-[29.5rem] flex-col">
      {CHAIN.map((step) => (
        <div key={step.sensor} className="flex items-stretch gap-3.5 pb-2.5">
          <span aria-hidden className="flex flex-col items-center pt-3.5">
            <span className="size-3 shrink-0 rounded-full bg-level-medium ring-2 ring-paper" />
            <span className="w-0.5 flex-1 bg-rule-2" />
          </span>
          <div className="min-w-0 flex-1 rounded-card border border-rule bg-paper-2 px-4 py-2.5">
            <p className="break-all font-mono text-[0.875rem] text-ink">{step.actors}</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-sm">
              <span className="font-medium text-ink-2">{step.label}</span>
              <span className={cn("font-semibold", step.verdict === "blocked" ? "text-error" : "text-level-medium-ink")}>{step.verdict}</span>
              <span className="font-mono text-[0.8125rem] text-muted">· risk {step.risk}</span>
            </p>
          </div>
        </div>
      ))}
      <p className="flex items-center gap-3.5 pb-2.5 font-mono text-xs text-muted">
        <span aria-hidden className="text-level-critical-ink">↓</span>
        same actor · takeover chain · +15 × 2 listeners
      </p>
      <figcaption className="rounded-card border border-error/60 bg-level-critical-wash/75 px-5 py-4">
        <span className="flex items-center gap-4">
          <span className="num font-display text-[3.25rem] font-bold leading-none text-level-critical-ink">85</span>
          <span className="min-w-0">
            <span className="block text-lg font-semibold text-ink">One Critical incident</span>
            <span className="block text-sm text-ink-2">Payroll export blocked · human approval requested</span>
          </span>
        </span>
        <span className="mt-3 flex flex-wrap gap-1.5">
          {CHAIN_TAGS.map((tag) => (
            <MitreChip key={tag.technique_id} tag={tag} />
          ))}
        </span>
      </figcaption>
    </figure>
  );
}

export default function Home() {
  return (
    <div data-theme="soc" className="flex min-h-full flex-1 flex-col bg-paper text-ink">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <span className="flex items-center gap-2">
          <KairosMark />
          <Wordmark />
        </span>
        <ButtonLink href={ROUTES.login} variant="ghost" size="sm">
          Log in
        </ButtonLink>
      </header>

      <main className="flex-1">
        {/* Hero: headline + lead + CTA above the fold; the chain visual carries the story. */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,29.5rem)] lg:gap-16">
          <div>
            <p className="font-mono text-xs font-medium tracking-[0.14em] text-accent-deep">
              THREE LISTENERS · ONE INCIDENT STORY · HUMAN APPROVAL
            </p>
            <h1 className="mt-5 max-w-[12ch] font-display text-[2.75rem] font-bold leading-[1.05] tracking-[var(--tracking-display)] sm:text-[4rem]">
              Kairos sees the whole attack.
            </h1>
            <p className="lead mt-5 max-w-[30ch] text-ink-2">Three listeners, one incident story, a human on every big call.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={ROUTES.console} size="lg">
                Open the console
              </ButtonLink>
            </div>
            <p className="mt-5 font-mono text-xs text-muted">Demo accounts are provisioned by the team · cisco.example</p>
          </div>
          <TakeoverChain />
        </section>

        {/* Correlation: the pitch, with the demo chain as an equation. */}
        <section className="border-y border-rule bg-paper-2">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
            <SectionTitle>Three yellow alerts become one red alarm.</SectionTitle>
            <p className="mt-4 max-w-[62ch] text-md leading-relaxed text-ink-2">
              Alone, each event is just suspicious. Kairos links events that share an actor — or form a takeover chain — into one
              incident, and adds +15 risk for every extra listener that saw it.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              {CHAIN.map((step, i) => (
                <div key={step.sensor} className="contents">
                  {i > 0 && (
                    <span aria-hidden className="hidden font-display text-2xl text-muted md:inline">
                      +
                    </span>
                  )}
                  <div className="flex min-w-[11rem] flex-col gap-2 rounded-card border border-rule bg-paper px-4 py-3.5">
                    <span className="flex items-center gap-2 font-medium">
                      <SensorIcon sensor={step.sensor} className="text-muted" />
                      {step.label}
                    </span>
                    <LevelBadge level="medium" risk={step.risk} className="self-start" />
                  </div>
                </div>
              ))}
              <span aria-hidden className="hidden font-display text-2xl text-muted md:inline">
                →
              </span>
              <div className="flex items-center gap-4 rounded-card border border-error/60 bg-level-critical-wash/60 px-5 py-4">
                <span className="num font-display text-[2.5rem] font-bold leading-none text-level-critical-ink">85</span>
                <span>
                  <span className="block font-semibold">One Critical incident</span>
                  <span className="block font-mono text-xs text-muted">same actor · takeover chain · 3 listeners</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* The three listeners. */}
        <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <SectionTitle>Three listeners, one story.</SectionTitle>
          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            {LISTENERS.map((l) => (
              <article key={l.sensor} className="rounded-card border border-rule bg-paper-2 px-6 py-5">
                <SensorIcon sensor={l.sensor} size={24} className="text-accent" />
                <h3 className="mt-3 text-lg font-semibold">{l.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{l.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Code-not-AI scoring with the published bands. */}
        <section className="border-y border-rule bg-paper-2">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-16">
            <div>
              <SectionTitle>Code makes the final call.</SectionTitle>
              <p className="mt-4 max-w-[52ch] text-md leading-relaxed text-ink-2">
                Every event gets a 0–100 risk score from rules in code — not from a model’s mood. An attacker can talk an AI into
                saying “low”; they can’t talk code out of a number.
              </p>
            </div>
            <div>
              <div aria-hidden className="flex gap-0.5 overflow-hidden rounded-[2px]">
                {BANDS.map((b) => (
                  <span key={b.label} className={cn("h-3", b.bar)} style={{ width: b.share }} />
                ))}
              </div>
              <dl className="m-0 mt-2 flex gap-0.5">
                {BANDS.map((b) => (
                  <div key={b.label} style={{ width: b.share }}>
                    <dt className={cn("text-sm font-semibold", b.ink)}>{b.label}</dt>
                    <dd className="m-0 font-mono text-xs text-muted">{b.range}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-sm text-muted">High pauses the action automatically — reversibly. Critical also pings a human.</p>
            </div>
          </div>
        </section>

        {/* Human approvals. */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
          <div>
            <SectionTitle>Humans stay in charge.</SectionTitle>
            <p className="mt-4 max-w-[52ch] text-md leading-relaxed text-ink-2">
              Locking an account, revoking sessions or freezing the AI agent always needs a human tap on a phone. If nobody answers,
              paused actions stay paused — and nobody gets locked out. One kill switch freezes every agent instantly.
            </p>
          </div>
          <div>
            <div className="rounded-[10px] border border-rule-2 bg-paper-2 px-5 py-4">
              <p className="font-mono text-[0.625rem] font-medium tracking-[0.14em] text-muted">APPROVAL REQUEST</p>
              <p className="mt-2 font-medium">Contain j.smith and freeze finance_agent?</p>
              <p className="mt-1.5 font-mono text-xs text-muted">inc_0042 · Risk 85 Critical</p>
              {/* Presentational: the real approval flow lives on /approve. */}
              <div aria-hidden className="mt-3 flex gap-2">
                <span className="inline-flex h-8 items-center rounded-input bg-accent px-3.5 text-sm font-semibold text-accent-ink">Approve</span>
                <span className="inline-flex h-8 items-center rounded-input px-3.5 text-sm font-medium text-ink-2 ring-1 ring-inset ring-rule-2">Deny</span>
              </div>
            </div>
            <p className="mt-2.5 font-mono text-xs text-muted">Approval text comes from code templates, never from attacker content.</p>
          </div>
        </section>

        {/* Final call to action. */}
        <section className="border-t border-rule bg-paper-2">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6 sm:py-20">
            <h2 className="max-w-none font-display text-[2rem] font-semibold tracking-[var(--tracking-display)] sm:text-[2.75rem]">
              See the whole attack.
            </h2>
            <div className="flex flex-wrap justify-center gap-3">
              <ButtonLink href={ROUTES.console} size="lg">
                Open the console
              </ButtonLink>
              <ButtonLink href={ROUTES.login} variant="ghost" size="lg">
                Log in
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule">
        <p className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-muted sm:px-6">{DISCLAIMER_TEXT}</p>
      </footer>
    </div>
  );
}
