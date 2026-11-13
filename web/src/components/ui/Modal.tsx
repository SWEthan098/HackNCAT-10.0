"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./Button";
import { IconX } from "./Icons";

/**
 * Modal built on the native <dialog> + showModal(): focus trap, Escape to close, inert
 * page behind and ::backdrop come from the browser. Closes on backdrop click too.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal w-[min(32rem,calc(100vw-2rem))] rounded-card border border-rule bg-paper p-0 text-ink shadow-card"
      aria-labelledby="modal-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
        <div>
          <h2 id="modal-title" className="text-lg">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="relative -m-1 rounded-input p-1 text-muted transition-colors before:absolute before:-inset-2 hover:text-ink"
        >
          <IconX size={18} />
        </button>
      </div>
      {children && <div className="px-5 py-4">{children}</div>}
      {footer && <div className="flex justify-end gap-2 border-t border-rule px-5 py-3">{footer}</div>}
    </dialog>
  );
}

/** Confirmation for destructive or session-ending actions. */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "primary",
  loading = false,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} autoFocus>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
