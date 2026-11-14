"use client";

// OWNER: Jordan (P4). The public Attack Picker (the QR code on the pitch slide lands here).
// No login. Each visitor gets an auto codename on their first launch; no real names collected.
// Password Guessing, Fake Boss Message and Full Attack go to POST /playground/launch; Trick the
// AI goes to POST /attack. Results are plain text only (see ResultPanel).

import { useRef, useState, type ReactNode } from "react";
import { IconInbox, IconKey, IconPulse, IconSpark, Spinner } from "@/components/ui";
import { DISCLAIMER_TEXT } from "@/components/kairos/Disclaimer";
import { apiFetch } from "@/lib/api";
import {
  ATTACK_NAMES,
  DEFAULT_BOSS,
  LAUNCH_COPY,
  DEFAULT_PASSWORD,
  DEFAULT_TRICK,
  buildAttackRequest,
  buildLaunchRequest,
  checkMessage,
  classifyError,
  deliveryFor,
  type BossSettings,
  type PasswordSettings,
  type ResultState,
  type TrickSettings,
} from "@/lib/attack";
import type { AttackResponse, AttackType, PlaygroundLaunchResponse } from "@/lib/types/kairos";
import { LiveCounter } from "./LiveCounter";
import { BossPanel, FullPanel, PasswordPanel, TrickPanel } from "./panels";
import { ResultPanel } from "./ResultPanel";
import { useCodename } from "./useCodename";

const PICKS: ReadonlyArray<{ type: AttackType; blurb: string; icon: ReactNode }> = [
  { type: "password_guessing", blurb: "A bot guesses guest passwords", icon: <IconKey size={22} /> },
  { type: "fake_boss", blurb: "Pose as a boss, ask for money", icon: <IconInbox size={22} /> },
  { type: "trick_ai", blurb: "Talk the finance AI into leaking", icon: <IconSpark size={22} /> },
  { type: "full_attack", blurb: "All three, as one attacker", icon: <IconPulse size={22} /> },
];

/** Keep "running" on screen long enough to read, even when the API answers instantly. */
const MIN_RUNNING_MS = 650;

export function AttackScreen() {
  const { codename, ensureCodename } = useCodename();
  const [pick, setPick] = useState<AttackType>("trick_ai");
  const [password, setPassword] = useState<PasswordSettings>(DEFAULT_PASSWORD);
  const [boss, setBoss] = useState<BossSettings>(DEFAULT_BOSS);
  const [trick, setTrick] = useState<TrickSettings>(DEFAULT_TRICK);
  const [trickError, setTrickError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState>({ status: "idle" });
  const [lastLaunch, setLastLaunch] = useState<AttackType | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  const running = result.status === "running";

  function revealResult() {
    const el = resultRef.current;
    if (!el || window.matchMedia("(min-width: 64rem)").matches) return; // side by side on desktop
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  async function launch(type: AttackType) {
    if (running) return;
    let request: () => Promise<ResultState>;
    if (type === "trick_ai") {
      const check = checkMessage(trick.message);
      if (!check.ok) {
        setTrickError(check.error);
        document.getElementById("atk-panel")?.querySelector("textarea")?.focus();
        return;
      }
      setTrickError(null);
      const built = buildAttackRequest(trick, ensureCodename());
      if (!built.ok) return;
      const body = built.body;
      request = async () => ({
        status: "result",
        result: {
          kind: "trick",
          response: await apiFetch<AttackResponse>("/attack", { method: "POST", body }),
          delivery: deliveryFor(trick.placement),
          goal: trick.goal,
          message: body.message,
        },
      });
    } else {
      const body = buildLaunchRequest(type, { password, boss, trick }, ensureCodename());
      request = async () => ({
        status: "result",
        result: {
          kind: "playground",
          attackType: type,
          response: await apiFetch<PlaygroundLaunchResponse>("/playground/launch", { method: "POST", body }),
        },
      });
    }

    setLastLaunch(type);
    setResult({ status: "running", attackType: type });
    requestAnimationFrame(revealResult);
    const started = performance.now();
    let next: ResultState;
    try {
      next = await request();
    } catch (e) {
      next = { status: "error", attackType: type, error: classifyError(e) };
    }
    const wait = MIN_RUNNING_MS - (performance.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    setResult(next);
  }

  return (
    <div data-theme="kairos-attack" className="atk flex min-h-dvh flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 sm:px-6 lg:px-10">
        <header className="flex min-h-16 items-center justify-between gap-3 border-b atk-rule">
          <span className="font-display text-lg font-semibold tracking-[var(--tracking-display)]">Kairos</span>
          <p className="min-w-0 truncate text-right text-sm" aria-live="polite">
            {codename ? (
              <>
                <span className="atk-muted">You are </span>
                <span className="font-medium atk-signal">{codename}</span>
              </>
            ) : (
              <span className="atk-muted">Codename on your first launch</span>
            )}
          </p>
        </header>

        <div className="grid flex-1 gap-8 pt-8 pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-12 lg:pt-12">
          <main className="min-w-0">
            <h1 className="atk-display">Join the Kairos Red Team</h1>
            <p className="lead mt-4 atk-ink-2">
              Attack a fictional company&apos;s AI assistant from your phone. Kairos tries to stop you, and the defenders watch it
              happen on the big screen.
            </p>
            <div className="mt-4">
              <LiveCounter />
            </div>

            <section aria-labelledby="atk-pick-h" className="mt-10">
              <h2 id="atk-pick-h" className="text-xl">
                Pick an attack
              </h2>
              <fieldset aria-labelledby="atk-pick-h" className="mt-3 grid grid-cols-2 gap-2.5" disabled={running}>
                {PICKS.map((p) => (
                  <label key={p.type} className="atk-choice min-h-24 flex-col items-start gap-2 p-3.5 sm:p-4">
                    <input
                      type="radio"
                      name="attack-type"
                      className="visually-hidden"
                      value={p.type}
                      checked={pick === p.type}
                      onChange={() => setPick(p.type)}
                    />
                    <span className="atk-tile-icon">{p.icon}</span>
                    <span className="min-w-0">
                      <span className="block font-display text-base font-semibold leading-tight sm:text-lg">{ATTACK_NAMES[p.type]}</span>
                      <span className="mt-1 block text-sm leading-snug atk-muted">{p.blurb}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </section>

            <section id="atk-panel" aria-label={`${ATTACK_NAMES[pick]} settings`} className="atk-panel mt-4 p-4 sm:p-6">
              <h2 className="text-xl">{ATTACK_NAMES[pick]}</h2>
              <div className="mt-3">
                {pick === "password_guessing" && <PasswordPanel value={password} onChange={setPassword} disabled={running} />}
                {pick === "fake_boss" && <BossPanel value={boss} onChange={setBoss} disabled={running} />}
                {pick === "trick_ai" && (
                  <TrickPanel
                    value={trick}
                    onChange={(v) => {
                      setTrick(v);
                      if (trickError) setTrickError(null);
                    }}
                    disabled={running}
                    error={trickError}
                  />
                )}
                {pick === "full_attack" && <FullPanel password={password} boss={boss} trick={trick} />}
              </div>
              <div className="mt-6">
                <button type="button" className="atk-launch" onClick={() => launch(pick)} disabled={running} aria-busy={running || undefined}>
                  {running && <Spinner />}
                  {running ? LAUNCH_COPY[result.attackType].running : LAUNCH_COPY[pick].action}
                </button>
                <p className="mt-3 text-center text-sm atk-muted">{LAUNCH_COPY[pick].target}</p>
              </div>
            </section>
          </main>

          <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start" aria-label="Result">
            <ResultPanel ref={resultRef} state={result} onRetry={() => lastLaunch && launch(lastLaunch)} />
          </aside>
        </div>

        <footer className="border-t atk-rule py-6 text-sm atk-muted">
          <p className="max-w-[65ch]">
            We store only the attack text with your codename, no personal info, and delete it after the event.
          </p>
          <p className="mt-2 max-w-[65ch]">{DISCLAIMER_TEXT}</p>
        </footer>
      </div>
    </div>
  );
}
