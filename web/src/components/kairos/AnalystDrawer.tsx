"use client";

// OWNER: Jordan (P4). AI analyst chat drawer (should-have): opens from any console page,
// asks POST /analyst/ask {question} -> {answer, citations[]}, shows the answer with clickable
// citations (MITRE ids link to the official page; event ids are compact E1, E2, … labels).
//
// The analyst is read-only and its answers are built from attacker-influenced event text, so
// the answer renders as plain text and citation links are only built from validated MITRE ids.

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button, Field, IconExternal, IconSpark, IconX, Spinner, cn } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { labelEventCitations } from "@/lib/analystText";
import { classifyCitation } from "@/lib/incidents";
import { AnalystAnswer } from "./AnalystAnswer";
import type { AnalystAskResponse } from "@/lib/types/kairos";

type Turn = { question: string; answer: string; citations: string[] } | { question: string; error: string };

function Citations({ citations }: { citations: string[] }) {
  if (citations.length === 0) return null;
  // The event-id list comes separately from the answer, so cited events read as E1, E2, …
  // in order of appearance (full id in the tooltip). They stay non-link chips: a bare event
  // id has no page of its own to honestly link to (the payload carries no incident id).
  const eventLabels = labelEventCitations(citations);
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {citations.map((c) => {
        const cite = classifyCitation(c);
        const cls = "inline-flex items-center gap-1 rounded-input px-1.5 py-0.5 font-mono text-xs";
        if (cite.href) {
          return (
            <a
              key={c}
              href={cite.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(cls, "no-underline", cite.kind === "atlas" ? "bg-graphite text-graphite-ink" : "bg-accent-wash text-accent-deep")}
              aria-label={`${cite.raw}, opens the MITRE page in a new tab`}
            >
              {cite.raw}
              <IconExternal size={11} className="opacity-70" />
            </a>
          );
        }
        return (
          <span
            key={c}
            className={cn(cls, "bg-paper-3 text-ink-2")}
            title={cite.raw}
            aria-label={`${eventLabels.get(cite.raw) ?? cite.raw}, event ${cite.raw} cited by the analyst`}
          >
            {eventLabels.get(cite.raw) ?? cite.raw}
          </span>
        );
      })}
    </div>
  );
}

export function AnalystDrawer() {
  const { api } = useAuth();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Keep the newest turn in view.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns, busy]);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setQuestion("");
    try {
      const res = await api<AnalystAskResponse>("/analyst/ask", { method: "POST", body: { question: q } });
      setTurns((t) => [...t, { question: q, answer: res.answer, citations: res.citations ?? [] }]);
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status !== 0
          ? err.message
          : "The analyst can't be reached right now. Nothing was sent.";
      setTurns((t) => [...t, { question: q, error: msg }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" icon={<IconSpark size={16} />} onClick={() => setOpen(true)} aria-haspopup="dialog">
        Ask the analyst
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby="analyst-title"
        onClose={() => setOpen(false)}
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
        className="on-paper m-0 ml-auto h-dvh max-h-none w-[min(30rem,100vw)] max-w-none bg-paper p-0 text-ink shadow-card backdrop:bg-ink/40"
      >
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
            <h2 id="analyst-title" className="flex items-center gap-2 text-lg">
              <IconSpark size={18} className="text-accent" /> AI analyst
            </h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-input p-1 text-muted hover:text-ink">
              <IconX size={18} />
            </button>
          </header>

          <div ref={logRef} className="flex-1 overflow-y-auto px-4 py-4">
            {turns.length === 0 ? (
              <div className="text-sm text-ink-2">
                <p>Ask about any incident in plain English. The analyst reads the evidence and answers with citations. It can explain and suggest, but it can&apos;t change anything.</p>
                <p className="mt-3 font-medium text-ink">Try:</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {["What just happened and what should I do?", "Why was j.smith flagged?", "Is the Critical incident a true positive?"].map((ex) => (
                    <li key={ex}>
                      <button type="button" className="text-left text-accent underline-offset-4 hover:underline" onClick={() => setQuestion(ex)}>
                        {ex}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <ol className="flex flex-col gap-4">
                {turns.map((t, i) => (
                  <li key={i} className="flex flex-col gap-2">
                    <p className="self-end rounded-[var(--radius-input)] rounded-br-sm bg-accent-wash px-3 py-2 text-sm text-accent-deep">{t.question}</p>
                    {"error" in t ? (
                      <p role="alert" className="rounded-[var(--radius-input)] rounded-bl-sm border border-error/40 px-3 py-2 text-sm text-ink">
                        {t.error}
                      </p>
                    ) : (
                      <div className="rounded-[var(--radius-input)] rounded-bl-sm bg-paper-2 px-3 py-2">
                        <AnalystAnswer text={t.answer} className="text-sm text-ink" />
                        <Citations citations={t.citations} />
                      </div>
                    )}
                  </li>
                ))}
                {busy && (
                  <li className="flex items-center gap-2 text-sm text-muted">
                    <Spinner /> The analyst is reading the evidence…
                  </li>
                )}
              </ol>
            )}
          </div>

          <form onSubmit={ask} className="flex items-end gap-2 border-t border-rule px-4 py-3">
            <Field
              label="Ask the analyst"
              className="flex-1 [&_label]:sr-only"
              placeholder="What just happened?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={1000}
              autoComplete="off"
            />
            <Button type="submit" loading={busy} disabled={!question.trim()} className="mb-[1lh]">
              Ask
            </Button>
          </form>
        </div>
      </dialog>
    </>
  );
}
