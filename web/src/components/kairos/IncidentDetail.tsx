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
import { Alert, Button, ErrorState, IconChevronRight, LoadingState, Modal, TextAreaField, cn } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { STATUS_LABELS, chronological, killChain, scoreBreakdown } from "@/lib/incidents";
import { ROUTES } from "@/lib/routes";
import type { IncidentDetail, KairosEvent, Sensor } from "@/lib/types/kairos";
import { LevelBadge } from "./LevelBadge";
import { MitreChip } from "./MitreChip";

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

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("border-t border-rule pt-5", className)} aria-label={title}>
      <h2 className="mb-3">{title}</h2>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------------------

function ScoreMath({ incident }: { incident: IncidentDetail }) {
  const b = scoreBreakdown(incident.events);
  const extra = Math.max(0, b.sensors.length - 1);
  return (
    <Section title="Why it scores this high">
      <ol className="flex flex-col">
        {chronological(incident.events).map((e) => {
          const isBase = b.base?.eventId === e.id;
          return (
            <li key={e.id} className="flex items-center justify-between gap-3 border-b border-rule py-1.5 text-sm">
              <span className="min-w-0 truncate">
                {SENSOR_LABELS[e.sensor] ?? e.sensor} <span className="text-muted">{e.id}</span>
                {isBase && <span className="ml-2 font-medium text-accent-deep">highest, sets the base</span>}
              </span>
              <span className={cn("num shrink-0", isBase ? "font-semibold text-ink" : "text-muted")}>{e.risk}</span>
            </li>
          );
        })}
        <li className="flex items-center justify-between gap-3 border-b border-rule py-1.5 text-sm">
          <span>
            {b.sensors.length} {b.sensors.length === 1 ? "listener" : "listeners"} involved, +15 for each one after the first
            {extra > 0 && <span className="text-muted"> ({extra} × 15)</span>}
          </span>
          <span className="num shrink-0 font-semibold">+{b.bonus}</span>
        </li>
        <li className="flex items-center justify-between gap-3 py-2">
          <span className="font-medium">
            Incident score{b.capped && <span className="font-normal text-muted"> (capped at 100)</span>}
          </span>
          <span className="flex items-center gap-2">
            <span className="num text-sm text-muted">
              {b.base?.risk ?? 0} + {b.bonus} =
            </span>
            <LevelBadge level={incident.level} risk={incident.risk} />
          </span>
        </li>
      </ol>
      {b.total !== incident.risk && (
        <p className="mt-2 text-sm text-ink-2">
          The linked events add up to {b.total}, but the server scored this incident {incident.risk}. The server&apos;s score is
          the one Kairos acts on.
        </p>
      )}
      <p className="mt-2 text-sm text-muted">Scores come from rules in code, not from the AI.</p>
    </Section>
  );
}

function KillChainStrip({ events }: { events: KairosEvent[] }) {
  const steps = killChain(events);
  if (steps.length === 0) return null;
  return (
    <Section title="Attack path (MITRE ATT&CK and ATLAS)">
      <ol className="flex flex-wrap items-stretch gap-x-1 gap-y-2">
        {steps.map((step, i) => (
          <li key={step.tactic} className="flex items-stretch gap-1">
            <div
              className={cn(
                "flex min-w-36 flex-col gap-1.5 rounded-input border px-2.5 py-2",
                step.blocked ? "border-error/50 bg-level-critical-wash" : "border-rule bg-paper",
              )}
            >
              <span className="text-sm font-medium">
                {step.tactic}
                {step.blocked && <span className="ml-1.5 text-error">blocked</span>}
              </span>
              {step.techniques.map((t) => (
                <MitreChip key={t.technique_id} tag={t} linked />
              ))}
            </div>
            {i < steps.length - 1 && <IconChevronRight size={16} className="self-center text-muted" />}
          </li>
        ))}
      </ol>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-3 rounded-sm bg-accent-wash ring-1 ring-accent-2" /> ATT&amp;CK: attacks on
          people and accounts
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-3 rounded-sm bg-graphite" /> ATLAS: attacks on AI
        </span>
      </p>
    </Section>
  );
}

function Timeline({ events }: { events: KairosEvent[] }) {
  const ordered = chronological(events);
  return (
    <Section title="What happened, in order">
      <ol className="flex flex-col">
        {ordered.map((e, i) => {
          // A takeover link: this event's actor was the previous event's target.
          const takeover = i > 0 && ordered[i - 1].target === e.actor;
          return (
            <li key={e.id} className="grid grid-cols-[4.5rem_1fr] gap-x-3 border-b border-rule py-2.5 last:border-b-0">
              <span className="num pt-0.5 text-xs text-muted">{time(e.created_at)}</span>
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-medium">{e.actor}</span>
                  <span className="text-muted"> → </span>
                  <span className="font-medium">{e.target}</span>
                  {takeover && <span className="ml-2 text-xs text-accent-deep">same account as the step before</span>}
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
    <Section title="What each listener saw">
      <dl className="flex flex-col gap-4">
        {[...bySensor.entries()].map(([sensor, list]) => (
          <div key={sensor}>
            <dt className="font-medium">
              {SENSOR_LABELS[sensor] ?? sensor} <span className="font-normal text-muted">{SENSOR_ROLES[sensor] ?? ""}</span>
            </dt>
            {list.map((e) => (
              <dd key={e.id} className="m-0 mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                <LevelBadge level={e.level} risk={e.risk} />
                <span className={e.verdict === "blocked" ? "font-medium text-error" : "text-ink-2"}>{e.verdict}</span>
                <span className="basis-full text-ink-2 sm:basis-auto">{e.reason}</span>
              </dd>
            ))}
          </div>
        ))}
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
    <article className="flex flex-col gap-6">
      <div>
        {back}
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-ink-2">
              <LevelBadge level={incident.level} risk={incident.risk} />
              <span>{STATUS_LABELS[incident.status] ?? incident.status}</span>
              <span className="text-muted">{incident.source === "audience" ? "Audience attacker" : "Scripted chain"}</span>
              <span className="num text-muted">{time(incident.created_at)}</span>
            </div>
            <h1 className="max-w-[40ch] text-2xl">{incident.title}</h1>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setDialog("false_positive")} disabled={closed}>
                Mark false positive
              </Button>
              <Button size="sm" onClick={() => setDialog("containment")} disabled={containReason !== null}>
                Request containment
              </Button>
            </div>
            {containReason && <p className="text-xs text-muted">{containReason}</p>}
          </div>
        </div>
      </div>

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

      <section aria-label="AI analyst summary" className="rounded-card border border-rule bg-paper-2 px-4 py-3">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <h2 className="text-md">AI analyst summary</h2>
          {incident.triage_label && (
            <span className="rounded-input bg-paper px-2 py-0.5 text-xs font-medium text-ink ring-1 ring-rule-2">{incident.triage_label}</span>
          )}
        </div>
        <p className="whitespace-pre-line text-ink">
          {incident.summary ?? "The analyst hasn't summarized this incident yet. The evidence below is complete without it."}
        </p>
        <p className="mt-2 text-xs text-muted">Written by the AI analyst. It can explain and suggest; it can&apos;t act.</p>
      </section>

      <ScoreMath incident={incident} />
      <KillChainStrip events={incident.events} />
      <Timeline events={incident.events} />
      <ListenerFindings events={incident.events} />

      <Section title="Raw evidence">
        <details className="rounded-input border border-rule bg-paper">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
            Show the {incident.events.length} linked events exactly as recorded
          </summary>
          <pre className="max-h-96 overflow-auto border-t border-rule bg-graphite px-3 py-2 font-mono text-xs leading-relaxed text-graphite-ink">
            {JSON.stringify(incident.events, null, 2)}
          </pre>
        </details>
      </Section>

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
