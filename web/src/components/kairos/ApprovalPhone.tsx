"use client";

// OWNER: Jordan (P4). The approver's phone (checklist step 8).
//
// A new containment request rings: loud sound + full-screen red view (iPhones can't vibrate
// from the web). Approve / Deny call Daylen's API, which re-checks the approver role and that
// the request is still pending. The request text is shown exactly as the API wrote it from
// code templates, never attacker text, and as plain text. If nobody answers, held actions stay
// held and nobody is locked out.

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Alert, Button, EmptyState, IconAlert, IconCheck, IconPulse, LoadingState, cn } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { createAlarm, keepScreenOn, type Alarm, type WakeState } from "@/lib/approvalAlarm";
import { createClient } from "@/lib/supabase/client";
import type { Approval } from "@/lib/types/kairos";

export type ApprovalRow = Approval & { expires_at?: string | null };
export type Decision = "approve" | "deny";

const COLUMNS = "id, created_at, incident_id, status, summary, decided_by, decided_at, expires_at";

function asApproval(row: unknown): ApprovalRow | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.status !== "string" || typeof r.summary !== "string" || typeof r.created_at !== "string") {
    return null;
  }
  return {
    id: r.id,
    created_at: r.created_at,
    incident_id: typeof r.incident_id === "string" ? r.incident_id : "",
    status: r.status as Approval["status"],
    summary: r.summary,
    decided_by: typeof r.decided_by === "string" ? r.decided_by : null,
    decided_at: typeof r.decided_at === "string" ? r.decided_at : null,
    expires_at: typeof r.expires_at === "string" ? r.expires_at : null,
  };
}

function upsert(list: ApprovalRow[], row: ApprovalRow): ApprovalRow[] {
  const rest = list.filter((a) => a.id !== row.id);
  return [row, ...rest].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function decisionError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 403) return "This account isn't an approver, so the decision wasn't recorded.";
    if (e.status === 404 || e.status === 409) return "This request was already decided or has expired. Nothing changed.";
    if (e.status === 0) return "Couldn't reach the server. Nothing was decided. Try again.";
    return `${e.message} Nothing was decided.`;
  }
  return "Something went wrong. Nothing was decided.";
}

/** White-on-red controls for the alarm screen: hover darkens, press sinks, disabled dims. */
const onRedButton =
  "w-full text-on-error-fill transition-colors hover:bg-error-edge active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55";

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit" });

// ---------------------------------------------------------------------------------------
// View: the screen and the alarm. Takes data in, reports decisions out.
// ---------------------------------------------------------------------------------------

export function ApprovalPhoneView({
  approvals,
  baselineIds,
  live,
  onDecide,
}: {
  /** null while loading. */
  approvals: ApprovalRow[] | null;
  /** Ids present at first load: these never ring (only requests that arrive later do). */
  baselineIds: ReadonlySet<string> | null;
  live: "connecting" | "live" | "down";
  onDecide: (id: string, decision: Decision) => Promise<ApprovalRow>;
}) {
  const alarmRef = useRef<Alarm | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [armed, setArmed] = useState(false);
  const [soundUnavailable, setSoundUnavailable] = useState(false);
  const [wake, setWake] = useState<WakeState | null>(null);
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(new Set());
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const pending = (approvals ?? []).filter((a) => a.status === "pending");
  const ringing = baselineIds ? pending.find((a) => !baselineIds.has(a.id) && !acknowledged.has(a.id)) ?? null : null;
  const overlayOpen = testing || ringing !== null;

  const alarm = () => (alarmRef.current ??= createAlarm());

  // Sound follows the overlay: ring while it shows (if armed), stop when it closes.
  useEffect(() => {
    if (overlayOpen && armed) alarmRef.current?.ring();
    else alarmRef.current?.stop();
  }, [overlayOpen, armed]);
  useEffect(() => () => alarmRef.current?.stop(), []);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (overlayOpen && !d.open) d.showModal();
    if (!overlayOpen && d.open) d.close();
  }, [overlayOpen]);

  // The wake lock drops whenever the page is hidden; take it back when it's shown again.
  useEffect(() => {
    if (!armed) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void keepScreenOn(() => setWake("released")).then(setWake);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [armed]);

  const arm = () => {
    const ok = alarm().arm();
    setSoundUnavailable(!ok);
    setArmed(ok);
    void keepScreenOn(() => setWake("released")).then(setWake);
  };

  const testAlarm = () => {
    if (!armed) arm();
    setTesting(true);
  };

  const dismiss = () => {
    if (testing) setTesting(false);
    if (ringing) setAcknowledged((s) => new Set(s).add(ringing.id));
  };

  const decide = async (a: ApprovalRow, decision: Decision) => {
    setBusy(a.id);
    setErrors((all) => {
      const next = { ...all };
      delete next[a.id];
      return next;
    });
    try {
      await onDecide(a.id, decision);
      setAcknowledged((s) => new Set(s).add(a.id));
    } catch (e) {
      setErrors((all) => ({ ...all, [a.id]: decisionError(e) }));
    } finally {
      setBusy(null);
    }
  };

  const decisionButtons = (a: ApprovalRow, onRed: boolean) => (
    <div className="flex flex-col gap-2">
      <Button
        size="lg"
        variant={onRed ? "secondary" : "primary"}
        className="h-14 w-full text-lg"
        loading={busy === a.id}
        disabled={busy !== null && busy !== a.id}
        onClick={() => decide(a, "approve")}
        icon={<IconCheck size={20} />}
      >
        Approve
      </Button>
      {onRed ? (
        // A plain button: the ghost variant's own ink colour would override white-on-red.
        <button
          type="button"
          className={cn(onRedButton, "h-12 rounded-input border border-on-error-fill/70 font-medium")}
          disabled={busy !== null}
          onClick={() => decide(a, "deny")}
        >
          Deny
        </button>
      ) : (
        <Button size="lg" variant="ghost" className="h-12 w-full border border-rule-2" disabled={busy !== null} onClick={() => decide(a, "deny")}>
          Deny
        </Button>
      )}
      {errors[a.id] && (
        <p role="alert" className={cn("text-sm font-medium", onRed ? "text-on-error-fill" : "text-error")}>
          {errors[a.id]}
        </p>
      )}
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[1.75rem]">Approvals</h1>
        <p role="status" className={cn("flex items-center gap-1.5 text-sm", live === "down" ? "font-medium text-error" : "text-muted")}>
          <IconPulse size={16} className={live === "live" ? "text-accent" : undefined} />
          {live === "live" ? "Live" : live === "down" ? "Not connected" : "Connecting…"}
        </p>
      </div>

      {live === "down" && (
        <Alert tone="error" title="New requests won't ring">
          The live connection dropped. Reload this page before the demo.
        </Alert>
      )}

      {!armed ? (
        <section aria-label="Alarm setup" className="flex flex-col gap-3 rounded-card border border-rule border-l-2 border-l-accent bg-paper-2 p-4">
          <p className="text-ink">
            Tap below so this phone can ring out loud and keep its screen on. Phones block sound until you tap.
          </p>
          <Button size="lg" className="h-12 w-full" onClick={arm}>
            Start listening
          </Button>
          {soundUnavailable && <p className="text-sm text-error">This browser can&apos;t play the alarm sound. The red screen still shows.</p>}
        </section>
      ) : (
        <section aria-label="Alarm status" className="flex flex-col gap-2 rounded-card border border-rule bg-paper-2 p-4 text-sm">
          <p className="flex items-center gap-2">
            <IconCheck size={16} className="text-success" /> Alarm sound is on. Keep the volume up.
          </p>
          <p className="flex items-center gap-2">
            {wake === "on" ? <IconCheck size={16} className="text-success" /> : <IconAlert size={16} className="text-error" />}
            {wake === "on"
              ? "The screen will stay on."
              : wake === "unsupported"
                ? "This browser can't keep the screen on. Turn off auto-lock in your phone settings."
                : wake === "released"
                  ? "The screen may sleep again. Tap the page to wake it, then keep this tab open."
                  : wake === "failed"
                    ? "Couldn't keep the screen on. Turn off auto-lock in your phone settings."
                    : "Checking whether the screen can stay on…"}
          </p>
          <Button variant="secondary" size="sm" className="mt-1 self-start" onClick={testAlarm}>
            Test the alarm
          </Button>
        </section>
      )}

      <section aria-label="Containment requests" className="flex flex-col gap-3">
        {!approvals ? (
          <LoadingState label="Loading requests" lines={3} />
        ) : approvals.length === 0 ? (
          <EmptyState title="No requests yet" description="When Kairos needs a human decision, it appears here and this phone rings." />
        ) : (
          approvals.map((a) => (
            <article
              key={a.id}
              className={cn(
                "rounded-card border p-4",
                a.status === "pending" ? "border-error/60 border-l-4 border-l-level-critical bg-paper-2" : "border-rule bg-paper",
              )}
            >
              <p className="mb-2 flex items-center justify-between gap-2 text-sm">
                <span className={a.status === "pending" ? "font-semibold text-level-critical-ink" : "font-medium text-ink-2"}>
                  {a.status === "pending" ? "Waiting for you" : a.status === "approved" ? "Approved" : a.status === "denied" ? "Denied" : "Expired"}
                </span>
                <span className="num font-mono text-[0.8125rem] text-muted">{clock(a.decided_at ?? a.created_at)}</span>
              </p>
              <p className={cn("whitespace-pre-line", a.status === "pending" ? "text-[1.0625rem] leading-relaxed text-ink" : "text-ink-2")}>{a.summary}</p>
              {a.status === "pending" && <div className="mt-4">{decisionButtons(a, false)}</div>}
              {a.status === "expired" && (
                <p className="mt-2 text-sm text-ink-2">Nobody answered in time. Held actions stay held, and nobody was locked out.</p>
              )}
            </article>
          ))
        )}
      </section>

      <dialog
        ref={dialogRef}
        aria-labelledby="alarm-title"
        onCancel={(e) => {
          e.preventDefault();
          dismiss();
        }}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-error-fill p-0 text-on-error-fill backdrop:bg-error-fill [--color-focus:var(--color-on-error-fill)]"
      >
        <div className="mx-auto flex min-h-full max-w-lg flex-col justify-between gap-6 px-5 py-8">
          <div className="flex flex-col gap-4">
            <p className="flex items-center gap-2 text-lg font-medium">
              <IconAlert size={28} /> {testing ? "Test alarm" : "Approval needed"}
            </p>
            <h2 id="alarm-title" className="max-w-none text-[2.25rem] leading-[1.05] text-on-error-fill">
              {testing ? "This is how a real request looks and sounds" : "Kairos is asking you to decide"}
            </h2>
            <p className="whitespace-pre-line text-lg">
              {testing ? "Nothing will be approved. If you can hear this across the room, the volume is right." : ringing?.summary}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {!testing && ringing && decisionButtons(ringing, true)}
            <button type="button" className={cn(onRedButton, "h-11 rounded-input underline underline-offset-4")} onClick={dismiss}>
              {testing ? "Stop the test" : "Silence and decide later"}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Container: who is signed in, the approvals table (RLS: approvers only), live updates, API.
// ---------------------------------------------------------------------------------------

export function ApprovalPhone() {
  const { api, roles } = useAuth();
  const isApprover = roles?.includes("approver") ?? false;
  const [approvals, setApprovals] = useState<ApprovalRow[] | null>(null);
  const [baseline, setBaseline] = useState<ReadonlySet<string> | null>(null);
  const [live, setLive] = useState<"connecting" | "live" | "down">("connecting");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isApprover) return;
    const supabase = createClient();
    let cancelled = false;

    supabase
      .from("approvals")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setLoadError(error?.message ?? "The request list didn't load.");
          return;
        }
        const rows = data.map(asApproval).filter((a): a is ApprovalRow => a !== null);
        setApprovals((prev) => rows.reduce(upsert, prev ?? []));
        setBaseline(new Set(rows.map((a) => a.id)));
        setLoadError(null);
      });

    const onRow = (payload: { new: unknown }) => {
      const row = asApproval(payload.new);
      if (row && !cancelled) setApprovals((list) => upsert(list ?? [], row));
    };
    const channel = supabase
      .channel("approvals-phone")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "approvals" }, onRow)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "approvals" }, onRow)
      .subscribe((state) => {
        if (cancelled) return;
        if (state === "SUBSCRIBED") setLive("live");
        if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") setLive("down");
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [isApprover]);

  const decide = useCallback(
    async (id: string, decision: Decision) => {
      const result = await api<Approval>(`/approvals/${encodeURIComponent(id)}/${decision}`, { method: "POST" });
      const row = asApproval(result);
      if (row) setApprovals((list) => upsert(list ?? [], row));
      return row ?? (result as ApprovalRow);
    },
    [api],
  );

  if (roles === null) return <LoadingState label="Checking your account" lines={2} />;
  if (!isApprover) {
    return (
      <div className="mx-auto w-full max-w-lg">
        <h1 className="mb-4 text-2xl">Approvals</h1>
        <EmptyState
          title="This page is for approvers"
          description="Your account doesn't have the approver role, so the database won't show it containment requests. Ask Daylen to add the role, then reload."
        />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-lg">
        <h1 className="mb-4 text-2xl">Approvals</h1>
        <Alert tone="error" title="Couldn't load requests">
          {loadError} Reload the page to try again.
        </Alert>
      </div>
    );
  }
  return <ApprovalPhoneView approvals={approvals} baselineIds={baseline} live={live} onDecide={decide} />;
}
