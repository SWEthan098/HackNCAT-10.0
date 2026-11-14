"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";
import { IconAlert, IconEye, IconEyeOff } from "./Icons";

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  /** Quiet hint under the field. Replaced by `error` when present. */
  helper?: ReactNode;
  error?: string | null;
  /** Content for the right-edge slot (e.g. a toggle button). */
  trailing?: ReactNode;
  id?: string;
};

export const inputClasses =
  "field-input h-10 w-full rounded-input border border-muted bg-paper px-3 text-md text-ink " +
  "placeholder:text-muted transition-colors hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-55 " +
  "aria-invalid:border-error";

/**
 * Label above, input, then one helper line that the error replaces (never a second line).
 * Wires aria-invalid / aria-describedby / aria-required for assistive tech.
 */
export function Field({ label, helper, error, trailing, id, required, className, ...rest }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const hint = error ?? helper;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
        {required && <span className="font-normal text-muted"> (required)</span>}
      </label>
      <div className="relative">
        <input
          id={inputId}
          className={cn(inputClasses, trailing || error ? "pr-10" : undefined)}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint ? hintId : undefined}
          aria-required={required || undefined}
          required={required}
          {...rest}
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
          {trailing ?? (error ? <IconAlert size={18} className="mr-2 text-error" /> : null)}
        </div>
      </div>
      <p id={hintId} className={cn("min-h-[1lh] text-sm", error ? "text-error" : "text-muted")} aria-live="polite">
        {hint}
      </p>
    </div>
  );
}

/** Password field with a show/hide toggle. */
export function PasswordField(props: Omit<FieldProps, "type" | "trailing">) {
  const [visible, setVisible] = useState(false);
  return (
    <Field
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={props.id}
          className="relative grid size-8 place-items-center rounded-input text-muted transition-colors before:absolute before:-inset-1.5 hover:bg-paper-3 hover:text-ink"
        >
          {visible ? <IconEyeOff size={18} /> : <IconEye size={18} />}
        </button>
      }
    />
  );
}

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  label: string;
  helper?: ReactNode;
  error?: string | null;
  id?: string;
};

/** Multi-line twin of Field: same label, helper/error line and ARIA wiring. */
export function TextAreaField({ label, helper, error, id, required, className, ...rest }: TextAreaFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const hint = error ?? helper;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
        {required && <span className="font-normal text-muted"> (required)</span>}
      </label>
      <textarea
        id={inputId}
        className={cn(inputClasses, "h-auto min-h-24 resize-y py-2 leading-normal")}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint ? hintId : undefined}
        aria-required={required || undefined}
        required={required}
        {...rest}
      />
      <p id={hintId} className={cn("min-h-[1lh] text-sm", error ? "text-error" : "text-muted")} aria-live="polite">
        {hint}
      </p>
    </div>
  );
}
