"use client";

// OWNER: Jordan (P4). Incident detail, the hero screen of the demo (checklist step 7).
// Test: a judge could understand the attack from this screen alone.
//
// Event text (actor, target, action, reason) and the AI summary can quote attacker text, so
// everything renders as plain text. The only links out are MITRE pages built from validated
// technique ids on fixed hosts.

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Alert, Button, ErrorState, IconChevronRight, IconSpark, LoadingState, Modal, TextAreaField, cn } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { chronological, killChain, scoreBreakdown } from "@/lib/incidents";
import { ROUTES } from "@/lib/routes";
import type { IncidentDetail, KairosEvent, Level, Sensor } from "@/lib/types/kairos";
import { AnalystAnswer } from "./AnalystAnswer";
import { LEVEL_INK, LEVEL_LABELS, LEVEL_SIGNAL, LevelBadge } from "./LevelBadge";
import { MitreChip } from "./MitreChip";
import { Panel } from "./Panel";
import { SensorIcon } from "./SensorIcon";
import { StatusChip } from "./StatusChip";

const SENSOR_LABELS: Record<Sensor, string> = {
  login_guard: "Login Guard",
  comms_guard: "Comms Guard",
  agent_firewall: "Agent Firewall",
};

const SENSOR_ROLES: Record<Sensor, string> = {
  login_guard: "watches sign-ins (timing only)",
  comms_guard: "watches messages for phishing and impersonation",
  agent_firewall: "checks every action the AI agent tries",
};

/**
 * PROPOSED endpoints. Neither exists in the frozen contract or in Daylen's plan yet.
 * Until they do, the server answers 404/405 and the UI says the action isn't available;
 * it never pretends to succeed. Agree the final paths with Daylen and change them here.
 */
export const INCIDENT_ACTIONS = {
  /** Body: none. Expected: the pending Approval it created. */
  requestContainment: (id: string) => `/incidents/${encodeURIComponent(id)}/containment`,
  /** Body: { reason }. Expected: the updated Incident. */
  markFalsePositive: (id: string) => `/incidents/${encodeURIComponent(id)}/false-positive`,
};

const CLOSED_STATUSES = new Set(["contained", "closed", "false_positive"]);

function actionError(e: unknown): string {
  if (e instanceof ApiError && (e.status === 404 || e.status === 405)) {
    return "The server doesn't support this action yet, so nothing was changed.";
  }
  return e instanceof ApiError ? e.message : "The request failed. Nothing was changed.";
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour12: false });
}

function Section({
  title,
  meta,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Panel title={title} meta={meta} className={className} bodyClassName={bodyClassName}>
      {children}
    </Panel>
  );
}

/** Published risk bands (engine.score_to_level): where each level starts and ends on 0-100. */
const BANDS: Array<{ level: Level; from: number; to: number }> = [
  { level: "low", from: 0, to: 29 },
  { level: "medium", from: 30, to: 59 },
  { level: "high", from: 60, to: 84 },
  { level: "critical", from: 85, to: 100 },
];

const BAND_WASH: Record<Level, string> = {
  low: "bg-paper-3",
  medium: "bg-level-medium-wash",
  high: "bg-level-high-wash",
  critical: "bg-level-critical-wash",
};

/**
 * The risk scale: the four published bands on one 0-100 line, the highest single event as a
 * tick, and the listener bonus carrying it to the incident score. It shows how separate
 * medium alerts become one critical incident. The ledger below says the same in words.
 */
function RiskScale({ incident }: { incident: IncidentDetail }) {
  const b = scoreBreakdown(incident.events);
  const score = Math.max(0, Math.min(100, incident.risk));
  const base = b.base ? Math.max(0, Math.min(score, b.base.risk)) : null;
  const sentence =
    base !== null && b.bonus > 0
      ? `Risk ${incident.risk} of 100, ${LEVEL_LABELS[incident.level]}: the highest single event scored ${b.base?.risk}, plus ${b.bonus} because ${b.sensors.length} listeners saw it.`
      : `Risk ${incident.risk} of 100, ${LEVEL_LABELS[incident.level]}.`;
  const width = (band: (typeof BANDS)[number]) => `${band.to - band.from + (band.level === "critical" ? 0 : 1)}%`;
  return (
    <figure className="m-0 flex flex-col gap-1">
      <figcaption className="visually-hidden">{sentence}</figcaption>
      <div aria-hidden className="relative pt-6">
        {/* Score label over the marker, kept inside the track at either end. */}
        <span
          className={cn("num absolute top-0 -translate-x-1/2 font-display text-lg font-bold leading-none", LEVEL_INK[incident.level])}
          style={{ left: `clamp(1rem, ${score}%, calc(100% - 1rem))` }}
        >
          {incident.risk}
        </span>
        {/* The score itself: highest single event, then the listener bonus on top of it. */}
        <div className="relative h-2.5 overflow-hidden rounded-[2px] bg-paper-3">
          {base !== null ? (
            <>
              <span className="absolute inset-y-0 left-0 bg-ink-2/45" style={{ width: `${base}%` }} />
              {score > base && (
                <span className={cn("absolute inset-y-0", LEVEL_SIGNAL[incident.level])} style={{ left: `${base}%`, width: `${score - base}%` }} />
              )}
            </>
          ) : (
            <span className={cn("absolute inset-y-0 left-0", LEVEL_SIGNAL[incident.level])} style={{ width: `${score}%` }} />
          )}
        </div>
        {/* The published bands it travels through. */}
        <div className="mt-1 flex h-1 gap-px">
          {BANDS.map((band) => (
            <span key={band.level} className={cn("h-full", LEVEL_SIGNAL[band.level], incident.level !== band.level && "opacity-55")} style={{ width: width(band) }} />
          ))}
        </div>
        <span className="absolute -bottom-1 top-[1.375rem] w-0.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: `${score}%` }} />
      </div>
      <div aria-hidden className="flex gap-px text-xs">
        {BANDS.map((band) => (
          <span
            key={band.level}
            className={cn("flex min-w-0 flex-wrap gap-x-1.5 pt-0.5", incident.level === band.level ? cn("font-semibold", LEVEL_INK[band.level]) : "text-muted")}
            style={{ width: width(band) }}
          >
            <span className="truncate">{LEVEL_LABELS[band.level]}</span>
            {/* Where each band starts: the thresholds code acts on. */}
            {band.from > 0 && <span className="num hidden font-mono font-normal sm:inline">{band.from}+</span>}
          </span>
        ))}
      </div>
      {base !== null && b.bonus > 0 && (
        <p aria-hidden className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-[1px] bg-ink-2/45" /> Highest single event {b.base?.risk}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn("h-2 w-4 rounded-[1px]", LEVEL_SIGNAL[incident.level])} /> +{b.bonus} for {b.sensors.length} listeners
          </span>
          <span className="flex items-center gap-1.5">
            = <span className={cn("num font-semibold", LEVEL_INK[incident.level])}>{incident.risk}</span> {LEVEL_LABELS[incident.level]}
          </span>
        </p>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------------------

function ScoreMath({ incident }: { incident: IncidentDetail }) {
  const b = scoreBreakdown(incident.events);
  const extra = Math.max(0, b.sensors.length - 1);
  return (
    <Section title="Why it scores this high" meta="Rules in code, not the AI" bodyClassName="p-0">
      <ol className="flex flex-col text-sm">
        {chronological(incident.events).map((e) => {
          const isBase = b.base?.eventId === e.id;
          return (
            <li key={e.id} className={cn("flex items-center justify-between gap-3 border-b border-rule px-3.5 py-2 sm:px-4", isBase && "bg-paper-3/60")}>
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="text-ink">{SENSOR_LABELS[e.sensor] ?? e.sensor}</span>
                <span className="font-mono text-[0.8125rem] text-muted">{e.id}</span>
                {isBase && <span className="font-medium text-accent-deep">highest, sets the base</span>}
              </span>
              <span className={cn("num shrink-0 font-mono", isBase ? "font-semibold text-ink" : "text-muted")}>{e.risk}</span>
            </li>
          );
        })}
        <li className="flex items-center justify-between gap-3 border-b border-rule px-3.5 py-2 sm:px-4">
          <span className="text-ink-2">
            {b.sensors.length} {b.sensors.length === 1 ? "listener" : "listeners"} involved, +15 for each one after the first
            {extra > 0 && <span className="text-muted"> ({extra} × 15)</span>}
          </span>
          <span className="num shrink-0 font-mono font-semibold text-ink">+{b.bonus}</span>
        </li>
        <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3.5 py-2.5 sm:px-4">
          <span className="font-medium text-ink">
            Incident score{b.capped && <span className="font-normal text-muted"> (capped at 100)</span>}
          </span>
          <span className="flex items-center gap-2">
            <span className="num font-mono text-muted">
              {b.base?.risk ?? 0} + {b.bonus} =
            </span>
            <LevelBadge level={incident.level} risk={incident.risk} />
          </span>
        </li>
      </ol>
      {b.total !== incident.risk && (
        <p className="border-t border-rule px-3.5 py-2.5 text-sm text-ink-2 sm:px-4">
          The linked events add up to {b.total}, but the server scored this incident {incident.risk}. The server&apos;s score is
          the one Kairos acts on.
        </p>
      )}
    </Section>
  );
}

function KillChainStrip({ events }: { events: KairosEvent[] }) {
  const steps = killChain(events);
  if (steps.length === 0) return null;
  return (
    <Section
      title="Attack path"
      meta={<span>MITRE ATT&amp;CK and ATLAS, in kill-chain order</span>}
    >
      <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11.5rem),1fr))] gap-2">
        {steps.map((step, i) => (
          <li
            key={step.tactic}
            className={cn(
              "relative flex min-w-0 flex-col gap-1.5 rounded-input border px-2.5 py-2",
              step.blocked ? "border-error/60 bg-level-critical-wash/60" : "border-rule bg-paper",
            )}
          >
            <span className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-ink">
                <span className="num mr-1.5 font-mono text-[0.75rem] text-muted">{i + 1}</span>
                {step.tactic}
              </span>
              {step.blocked && <span className="shrink-0 text-[0.8125rem] font-semibold text-error">blocked</span>}
            </span>
            {step.techniques.map((t) => (
              <MitreChip key={t.technique_id} tag={t} linked wrap className="self-start" />
            ))}
          </li>
        ))}
      </ol>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-3 rounded-[2px] bg-attack-wash ring-1 ring-attack-ink/60" /> ATT&amp;CK: attacks
          on people and accounts
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-3 rounded-[2px] bg-atlas-wash ring-1 ring-atlas-ink/60" /> ATLAS: attacks on
          AI
        </span>
      </p>
    </Section>
  );
}

function Timeline({ events }: { events: KairosEvent[] }) {
  const ordered = chronological(events);
  return (
    <Section title="What happened, in order" meta={<span className="num">{ordered.length} linked events</span>}>
      <ol className="flex flex-col">
        {ordered.map((e, i) => {
          // A takeover link: this event's actor was the previous event's target.
          const takeover = i > 0 && ordered[i - 1].target === e.actor;
          const last = i === ordered.length - 1;
          return (
            <li key={e.id} className="grid grid-cols-[4.75rem_0.75rem_minmax(0,1fr)] gap-x-2.5">
              <span className="num pt-0.5 font-mono text-[0.8125rem] text-muted">{time(e.created_at)}</span>
              {/* The spine: one node per event, joined to the next. */}
              <span aria-hidden className="relative flex justify-center">
                <span className={cn("relative z-[1] mt-1.5 size-2.5 rounded-full ring-2 ring-paper-2", LEVEL_SIGNAL[e.level])} />
                {!last && <span className="absolute bottom-0 top-1.5 w-px bg-rule-2" />}
              </span>
              <div className={cn("min-w-0", last ? "pb-0.5" : "pb-4")}>
                <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="break-all font-mono text-[0.875rem] text-ink">
                    {e.actor} <span className="text-muted">→</span> {e.target}
                  </span>
                  {takeover && <span className="text-[0.8125rem] font-medium text-accent-deep">same account as the step before</span>}
                </p>
                <p className="mt-0.5 text-sm text-ink-2">{e.action}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

function ListenerFindings({ events }: { events: KairosEvent[] }) {
  const bySensor = new Map<Sensor, KairosEvent[]>();
  for (const e of chronological(events)) bySensor.set(e.sensor, [...(bySensor.get(e.sensor) ?? []), e]);
  return (
    <Section title="What each listener saw" meta={<span className="num">{bySensor.size} of 3 listeners</span>} bodyClassName="p-0">
      <dl className="m-0 flex flex-col divide-y divide-rule">
        {[...bySensor.entries()].map(([sensor, list]) => {
          return (
            <div key={sensor} className="px-3.5 py-3 sm:px-4">
              <dt className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <SensorIcon sensor={sensor} className="text-accent" />
                <span className="font-medium text-ink">{SENSOR_LABELS[sensor] ?? sensor}</span>
                <span className="text-sm text-muted">{SENSOR_ROLES[sensor] ?? ""}</span>
              </dt>
              {list.map((e) => (
                <dd key={e.id} className="m-0 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <LevelBadge level={e.level} risk={e.risk} />
                  <span className={e.verdict === "blocked" ? "font-semibold text-error" : e.verdict === "flagged" ? "font-medium text-level-medium-ink" : "text-muted"}>
                    {e.verdict}
                  </span>
                  <span className="basis-full text-ink-2">{e.reason}</span>
                </dd>
              ))}
            </div>
          );
        })}
      </dl>
    </Section>
  );
}

// ---------------------------------------------------------------------------------------

function ContainmentDialog({ open, incident, onClose, onDone }: { open: boolean; incident: IncidentDetail; onClose: () => void; onDone: () => void }) {
  const { api } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(INCIDENT_ACTIONS.requestContainment(incident.id), { method: "POST" });
      setBusy(false);
      onDone();
    } catch (e) {
      setError(actionError(e));
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="Request containment?"
      description="This asks an approver on their phone to contain the accounts and agent involved. Nothing is locked until an approver taps Approve."
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy} autoFocus>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Send to approver
          </Button>
        </>
      }
    >
      {error && (
        <Alert tone="error" title="Containment was not requested">
          {error}
        </Alert>
      )}
    </Modal>
  );
}

function FalsePositiveDialog({ open, incident, onClose, onDone }: { open: boolean; incident: IncidentDetail; onClose: () => void; onDone: () => void }) {
  const { api } = useAuth();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = reason.trim();
  const fieldError = touched && trimmed.length === 0 ? "Say why this isn't a real attack. The reason is shown in the audit log." : null;

  const close = () => {
    if (busy) return;
    setError(null);
    setTouched(false);
    onClose();
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await api(INCIDENT_ACTIONS.markFalsePositive(incident.id), { method: "POST", body: { reason: trimmed } });
      setBusy(false);
      setReason("");
      setTouched(false);
      onDone();
    } catch (err) {
      setError(actionError(err));
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="Mark as false positive?"
      description="Closes the incident as not a real attack. It still counts in the false-positive number on the dashboard, so mistakes stay visible."
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-1">
        <TextAreaField
          label="Reason"
          name="reason"
          required
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          error={fieldError}
          helper="For example: the finance team confirmed the wire request was real."
          autoFocus
        />
        {error && (
          <Alert tone="error" title="The incident was not changed" className="mb-3">
            {error}
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="secondary" loading={busy}>
            Mark false positive
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------

export function IncidentDetailView({ id }: { id: string }) {
  const { api } = useAuth();
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [dialog, setDialog] = useState<"containment" | "false_positive" | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(() => {
    api<IncidentDetail>(`/incidents/${encodeURIComponent(id)}`)
      .then((data) => {
        setIncident(data);
        setError(null);
      })
      .catch((e) => setError({ status: e instanceof ApiError ? e.status : 0, message: e instanceof ApiError ? e.message : String(e) }));
  }, [api, id]);
  useEffect(load, [load]);

  const back = (
    <Link href={ROUTES.console} className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 no-underline hover:text-ink">
      <IconChevronRight size={14} className="rotate-180" /> All incidents
    </Link>
  );

  if (error) {
    return (
      <>
        {back}
        {error.status === 404 ? (
          <ErrorState title="No incident with that id" message="It may have been cleared by a demo reset. Go back to the queue to pick another." />
        ) : (
          <ErrorState title="Couldn't load this incident" message={error.message} onRetry={load} />
        )}
      </>
    );
  }
  if (!incident) {
    return (
      <>
        {back}
        <LoadingState label="Loading incident" lines={6} />
      </>
    );
  }

  const closed = CLOSED_STATUSES.has(incident.status);
  const awaiting = incident.status === "awaiting_approval";
  const containReason = closed
    ? "This incident is already closed."
    : awaiting
      ? "An approver has already been asked."
      : null;

  return (
    <article className="flex flex-col gap-3 sm:gap-4">
      <header className="flex flex-col gap-4 rounded-card border border-rule bg-paper-2 px-3.5 pb-4 pt-3 sm:px-5">
        {back}
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-1 basis-[28rem] gap-3.5 sm:gap-4">
            <span
              className={cn(
                "flex w-16 shrink-0 flex-col items-center justify-center self-start rounded-input py-2.5 sm:w-[4.5rem]",
                BAND_WASH[incident.level],
              )}
            >
              <span className={cn("num font-display text-[2rem] font-bold leading-none sm:text-[2.25rem]", LEVEL_INK[incident.level])}>{incident.risk}</span>
              <span className={cn("mt-1 text-xs font-semibold", LEVEL_INK[incident.level])}>{LEVEL_LABELS[incident.level]}</span>
            </span>
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink-2">
                <StatusChip status={incident.status} />
                <span className="text-muted">{incident.source === "audience" ? "Audience attacker" : "Scripted chain"}</span>
                <span className="num font-mono text-[0.8125rem] text-muted">{time(incident.created_at)}</span>
                <span className="font-mono text-[0.8125rem] text-muted">{incident.id}</span>
              </div>
              <h1 className="max-w-[60ch] text-[1.375rem] leading-[1.15] sm:text-[1.75rem]">{incident.title}</h1>
            </div>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setDialog("false_positive")} disabled={closed}>
                Mark false positive
              </Button>
              <Button size="sm" onClick={() => setDialog("containment")} disabled={containReason !== null}>
                Request containment
              </Button>
            </div>
            {containReason && <p className="text-sm text-muted">{containReason}</p>}
          </div>
        </div>
        <RiskScale incident={incident} />
      </header>

      {done && (
        <Alert tone="success" title={done}>
          The page has been refreshed with the server&apos;s latest state.
        </Alert>
      )}
      {awaiting && (
        <Alert tone="info" title="Awaiting approval">
          An approver has been asked on their phone. Paused actions stay paused until someone decides; nobody is locked out in
          the meantime.
        </Alert>
      )}

      <div className="grid items-start gap-3 sm:gap-4 min-[1100px]:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
          <section aria-label="AI analyst summary" className="rounded-card border border-rule border-l-2 border-l-accent bg-paper-2 px-3.5 py-3 sm:px-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <IconSpark size={18} className="text-accent" />
              <h2 className="text-[1.0625rem]">AI analyst summary</h2>
              {incident.triage_label && (
                <span className="rounded-[3px] bg-paper-3 px-1.5 py-0.5 text-[0.8125rem] font-medium text-ink ring-1 ring-inset ring-rule-2">
                  {incident.triage_label}
                </span>
              )}
            </div>
            {incident.summary ? (
              <AnalystAnswer text={incident.summary} className="max-w-[75ch] text-[0.96875rem] leading-relaxed text-ink" />
            ) : (
              <p className="max-w-[75ch] text-[0.96875rem] leading-relaxed text-ink">
                The analyst hasn&apos;t summarized this incident yet. The evidence below is complete without it.
              </p>
            )}
            <p className="mt-2 text-sm text-muted">Written by the AI analyst. It can explain and suggest; it can&apos;t act.</p>
          </section>
          <KillChainStrip events={incident.events} />
          <Timeline events={incident.events} />
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
          <ScoreMath incident={incident} />
          <ListenerFindings events={incident.events} />
          <Section title="Raw evidence" bodyClassName="p-0">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium text-ink hover:bg-paper-3 focus-visible:-outline-offset-2 sm:px-4 [&::-webkit-details-marker]:hidden">
                <IconChevronRight size={16} className="text-muted transition-transform group-open:rotate-90" />
                Show the {incident.events.length} linked events exactly as recorded
              </summary>
              <pre className="m-0 max-h-96 overflow-auto border-t border-rule bg-graphite px-3.5 py-3 font-mono text-[0.8125rem] leading-relaxed text-graphite-ink sm:px-4">
                {JSON.stringify(incident.events, null, 2)}
              </pre>
            </details>
          </Section>
        </div>
      </div>

      <ContainmentDialog
        open={dialog === "containment"}
        incident={incident}
        onClose={() => setDialog(null)}
        onDone={() => {
          setDialog(null);
          setDone("Containment requested");
          load();
        }}
      />
      <FalsePositiveDialog
        open={dialog === "false_positive"}
        incident={incident}
        onClose={() => setDialog(null)}
        onDone={() => {
          setDialog(null);
          setDone("Marked as false positive");
          load();
        }}
      />
    </article>
  );
}
