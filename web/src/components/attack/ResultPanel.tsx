"use client";

// Result area for every Attack Picker card: idle, running, result, error (offline, busy, refused).
//
// SECURITY: log lines, outcomes, reasons and the visitor's own trick are attacker-influenced.
// They are rendered ONLY as React text children (plain text): no markdown, no HTML, no links,
// no images. Never pass them to dangerouslySetInnerHTML or a markdown renderer.
//
// Step 10 hooks: TrickLayers is the place for the animated 5-layer reveal and "X of 5 layers
// deep"; TrickResult's footer is where the Appeal button goes; ErrorResult's rate_limited branch
// is where the countdown goes (retryAfterSeconds is already parsed).

import { useEffect, useId, useState, type Ref } from "react";
import { IconAlert, IconCheck, Spinner } from "@/components/ui";
import { ApiError, apiFetch } from "@/lib/api";
import {
  ATTACK_NAMES,
  BREACH_LAYERS,
  LAUNCH_COPY,
  RESPONSE_COPY,
  layerLabel,
  layersDeep,
  techniqueForDelivery,
  techniquesFor,
  trickTone,
  type AttackResult,
  type LaunchError,
  type ResultState,
  type TrickTone,
} from "@/lib/attack";
import { levelForRisk } from "@/lib/liveEvents";
import type { Appeal, AttackResponse, LayerResult, MitreTag, PlaygroundLaunchResponse } from "@/lib/types/kairos";
import { ResponseLadder } from "./ResponseLadder";

const LEVEL_LABEL = { low: "Low", medium: "Medium", high: "High", critical: "Critical" } as const;

export function ResultPanel({ state, onRetry, ref }: { state: ResultState; onRetry: () => void; ref?: Ref<HTMLElement> }) {
  return (
    <section ref={ref} aria-labelledby="atk-result-h" className="atk-panel scroll-mt-4 p-5 sm:p-6" tabIndex={-1}>
      <div aria-live="polite" aria-busy={state.status === "running"}>
        {state.status === "idle" && <IdleResult />}
        {state.status === "running" && <RunningResult label={LAUNCH_COPY[state.attackType].running} />}
        {state.status === "error" && <ErrorResult name={ATTACK_NAMES[state.attackType]} error={state.error} onRetry={onRetry} />}
        {state.status === "result" && <ResultBody result={state.result} />}
      </div>
    </section>
  );
}

function IdleResult() {
  return (
    <div>
      <h2 id="atk-result-h" className="text-xl">
        How Kairos responds
      </h2>
      <p className="mt-2 atk-ink-2">
        Kairos answers in proportion. Quiet attacks get watched, loud ones get blocked. Launch one to see where yours lands.
      </p>
      <div className="mt-6">
        <ResponseLadder />
      </div>
    </div>
  );
}

function RunningResult({ label }: { label: string }) {
  return (
    <div>
      <h2 id="atk-result-h" className="flex items-center gap-3 text-xl">
        <Spinner />
        {label}
      </h2>
      <p className="atk-well atk-log mt-4 px-3 py-3">
        Sending your attack to the Cisco sandbox <span className="atk-cursor" aria-hidden="true" />
      </p>
    </div>
  );
}

function ErrorResult({ name, error, onRetry }: { name: string; error: LaunchError; onRetry: () => void }) {
  const title =
    error.kind === "offline"
      ? "Kairos can't be reached"
      : error.kind === "rate_limited"
        ? "The defenders are busy"
        : "Kairos refused that request";
  // Rate-limit countdown (step 10): tick down, then the button frees itself.
  const [secondsLeft, setSecondsLeft] = useState(error.kind === "rate_limited" ? error.retryAfterSeconds : null);
  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) return;
    const t = window.setTimeout(() => setSecondsLeft((n) => (n === null ? null : n - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [secondsLeft]);
  const waiting = secondsLeft !== null && secondsLeft > 0;
  return (
    <div>
      <p className="text-sm atk-muted">{name}</p>
      <h2 id="atk-result-h" className="mt-1 flex items-start gap-3 text-xl">
        <IconAlert size={24} className="mt-0.5 flex-none atk-tone-challenged" />
        {title}
      </h2>
      <p className="mt-2 atk-ink-2">{error.message}</p>
      <button type="button" className="atk-ghost mt-5" onClick={onRetry} disabled={waiting}>
        {waiting ? `Try again in ${secondsLeft}s` : "Try again"}
      </button>
    </div>
  );
}

function ResultBody({ result }: { result: AttackResult }) {
  return result.kind === "playground" ? (
    <PlaygroundResult name={ATTACK_NAMES[result.attackType]} response={result.response} techniques={techniquesFor(result.attackType)} />
  ) : (
    <TrickResult result={result} />
  );
}

function PlaygroundResult({
  name,
  response,
  techniques,
}: {
  name: string;
  response: PlaygroundLaunchResponse;
  techniques: MitreTag[];
}) {
  const copy = RESPONSE_COPY[response.response_level];
  return (
    <div>
      <p className="text-sm atk-muted">{name}</p>
      <h2 id="atk-result-h" className={`mt-1 font-display text-4xl atk-tone-${response.response_level}`}>
        {copy.label}
      </h2>
      <p className="mt-2 atk-ink-2">{copy.meaning}</p>
      <div className="mt-5">
        <ResponseLadder level={response.response_level} />
      </div>
      <Facts risk={response.risk} techniques={techniques} />
      <Outcome text={response.outcome} />
      <LogLines lines={response.log_lines} />
    </div>
  );
}

const TRICK_HEADINGS: Record<TrickTone, string> = {
  blocked: "Blocked",
  flagged: "Flagged for review",
  harmless: "Harmless",
  breach: "You got through",
};

function TrickResult({ result }: { result: Extract<AttackResult, { kind: "trick" }> }) {
  const { response } = result;
  const tone = trickTone(response);
  // A harmless message is not an attack: only label it if the API itself returned a technique.
  const technique = response.technique ?? (tone === "harmless" ? null : techniqueForDelivery(result.delivery));
  return (
    <div>
      <p className="text-sm atk-muted">Trick the AI, {result.goal === "vault_code" ? "after the vault code" : "sending payroll out"}</p>
      <h2 id="atk-result-h" className={`mt-1 flex items-center gap-2 font-display text-4xl atk-tone-${tone}`}>
        {tone === "harmless" && <IconCheck size={32} className="flex-none" />}
        {TRICK_HEADINGS[tone]}
      </h2>
      <p className="mt-2 atk-ink-2">{response.reason}</p>
      {tone === "breach" && (
        <p className="mt-2 text-sm atk-ink-2">The defenders can see this attempt. Thanks for finding a gap in a test environment.</p>
      )}
      <TrickLayers layers={response.layers} blockedBy={response.blocked_by} breach={response.breach} animate={tone !== "harmless"} />
      <Facts techniques={technique ? [technique] : []} />
      <div className="mt-5">
        <p className="text-sm font-medium">What you sent</p>
        <p className="atk-well mt-2 whitespace-pre-wrap px-3 py-3 text-sm atk-ink-2 [overflow-wrap:anywhere]">{result.message}</p>
      </div>
      {(tone === "blocked" || tone === "flagged") && <AppealForm />}
    </div>
  );
}

/**
 * Appeal a block (step 10, fairness): POST /appeals is public. The contract's /attack
 * response carries no event id, so the appeal can't point at the exact event yet; the
 * visitor's reason is filed on its own (TODO: add event_id once Ethan returns one).
 */
function AppealForm() {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [filed, setFiled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("Say why this block was wrong, in a sentence or two.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch<Appeal>("/appeals", { method: "POST", body: { reason: trimmed.slice(0, 1000) } });
      setFiled(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status !== 0
          ? `${err.message} The appeal was not filed.`
          : "Kairos can't be reached, so the appeal was not filed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (filed) {
    return (
      <p className="mt-5 border-t atk-rule pt-4 text-sm atk-ink-2" role="status">
        <IconCheck size={16} className="mr-1.5 inline-block align-[-3px] atk-tone-harmless" />
        Appeal received. A defender will look at this block with your note beside it.
      </p>
    );
  }
  return (
    <div className="mt-5 border-t atk-rule pt-4">
      {!open ? (
        <p className="text-sm atk-ink-2">
          Think this block was a mistake?{" "}
          <button type="button" className="atk-link" onClick={() => setOpen(true)}>
            Appeal it
          </button>
        </p>
      ) : (
        <form noValidate onSubmit={submit}>
          <label htmlFor={inputId} className="block text-sm font-medium">
            Why was this block wrong? <span className="font-normal atk-muted">(required, stays anonymous)</span>
          </label>
          <textarea
            id={inputId}
            value={reason}
            maxLength={1000}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
            rows={3}
            className="atk-input mt-2 w-full resize-y"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-err` : undefined}
          />
          <p id={`${inputId}-err`} className="mt-1 min-h-[1lh] text-sm atk-tone-blocked" aria-live="polite">
            {error}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="submit" className="atk-ghost" disabled={busy}>
              {busy ? "Filing the appeal" : "File the appeal"}
            </button>
            <button type="button" className="atk-link text-sm" onClick={() => setOpen(false)} disabled={busy}>
              Never mind
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const STATUS_WORD: Record<LayerResult["status"], string> = { passed: "Passed", blocked: "Blocked here", skipped: "Not reached" };

/**
 * The 5 defense layers, revealed one by one (step 10), with "You made it X of 5 layers
 * deep" at the end. The reveal is pure CSS with per-row delays: content is in the page
 * from the start, and reduced-motion (base.css) collapses it to an instant appearance.
 */
function TrickLayers({
  layers,
  blockedBy,
  breach,
  animate,
}: {
  layers: AttackResponse["layers"];
  blockedBy: string | null;
  breach: boolean;
  animate: boolean;
}) {
  // Every launch passes through the "running" state, which unmounts this list, so the
  // reveal restarts by itself for each new result.
  if (layers.length === 0) return null;
  const deep = layersDeep(layers, breach);
  return (
    <div className="mt-5">
      <h3 className="text-base">Defense layers</h3>
      <ol className="mt-2 flex flex-col">
        {layers.map((l, i) => (
          <li
            key={l.name}
            style={animate ? ({ "--i": i } as React.CSSProperties) : undefined}
            className={`grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 border-t atk-rule py-2.5 first:border-t-0 ${animate ? "atk-layer-reveal" : ""}`}
            data-blocking={l.name === blockedBy || undefined}
          >
            <span className="num text-sm atk-muted" aria-hidden="true">
              {i + 1}
            </span>
            <span className={l.status === "blocked" ? "font-semibold" : undefined}>{layerLabel(l.name)}</span>
            <span className={`text-sm font-medium atk-tone-${l.status}`}>{STATUS_WORD[l.status]}</span>
          </li>
        ))}
      </ol>
      <p
        style={animate ? ({ "--i": layers.length } as React.CSSProperties) : undefined}
        className={`mt-3 text-lg font-semibold ${animate ? "atk-layer-reveal" : ""}`}
      >
        You made it <span className="num">{deep}</span> of <span className="num">{BREACH_LAYERS}</span> layers deep.
        {deep > 0 && deep < BREACH_LAYERS && <span className="ml-1 font-normal atk-ink-2">Closer than most. Try another angle.</span>}
        {deep === 0 && <span className="ml-1 font-normal atk-ink-2">The first wall held. Try hiding it differently.</span>}
      </p>
    </div>
  );
}

function Facts({ risk, techniques }: { risk?: number; techniques: MitreTag[] }) {
  if (risk === undefined && techniques.length === 0) return null;
  return (
    <dl className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-t atk-rule pt-4 text-sm">
      {risk !== undefined && (
        <>
          <dt className="atk-muted">Risk score</dt>
          <dd className="m-0">
            <span className="num font-semibold">{risk}</span>
            <span className="atk-muted"> of 100, {LEVEL_LABEL[levelForRisk(risk)]}</span>
          </dd>
        </>
      )}
      {techniques.length > 0 && (
        <>
          <dt className="atk-muted">MITRE</dt>
          <dd className="m-0 flex flex-col gap-1">
            {techniques.map((t) => (
              <span key={t.technique_id}>
                <span className="atk-code atk-signal">{t.technique_id}</span> <span className="atk-ink-2">{t.name}</span>
              </span>
            ))}
          </dd>
        </>
      )}
    </dl>
  );
}

function Outcome({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="mt-4">
      <p className="text-sm font-medium">Outcome</p>
      <p className="mt-1 atk-ink-2">{text}</p>
    </div>
  );
}

function LogLines({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-5">
      <p className="text-sm font-medium" id="atk-log-h">
        What the attacker sees
      </p>
      <ol role="log" aria-labelledby="atk-log-h" className="atk-well atk-log mt-2 max-h-72 overflow-y-auto px-3 py-3">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
    </div>
  );
}
