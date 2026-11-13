"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";
import { IconAlert, IconCheck, IconInfo, IconX } from "./Icons";

// Toasts are for events that are not the direct result of what the user is looking at
// (session expired, signed out in another tab). A form's own result belongs in an inline
// <Alert> next to the form instead.

type Tone = "info" | "success" | "error";
type Toast = { id: number; tone: Tone; message: string };
type ToastApi = { notify: (message: string, tone?: Tone) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const notify = useCallback(
    (message: string, tone: Tone = "info") => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-2), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext value={api}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[500] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border border-rule-2 bg-paper px-3 py-2.5 text-sm text-ink shadow-card"
          >
            <span className="mt-0.5">
              {t.tone === "error" ? (
                <IconAlert size={18} className="text-error" />
              ) : t.tone === "success" ? (
                <IconCheck size={18} className="text-success" />
              ) : (
                <IconInfo size={18} className="text-accent" />
              )}
            </span>
            <p className="flex-1">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className={cn("relative -m-1 rounded-input p-1 text-muted transition-colors hover:text-ink before:absolute before:-inset-2")}
            >
              <IconX size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
