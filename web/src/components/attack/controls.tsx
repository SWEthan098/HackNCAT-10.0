"use client";

// Form controls for the Attack Picker, styled by app/attack/attack.css (.atk scope).
// Native radios and ranges underneath, so keyboard and screen readers work for free.

import { useId, type ReactNode } from "react";

type Option<T extends string> = { value: T; label: string; hint?: string };

/** A labelled group of radio options laid out as buttons (44px+ tall). */
export function Segmented<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  disabled,
  columns,
  hint,
}: {
  legend: string;
  name: string;
  value: T;
  options: ReadonlyArray<Option<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Columns on a phone; defaults to one per option. */
  columns?: 2 | 3 | 4;
  hint?: ReactNode;
}) {
  const id = useId();
  const cols = columns ?? (options.length as 2 | 3 | 4);
  const grid = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[cols];
  return (
    <fieldset className="min-w-0" disabled={disabled} aria-describedby={hint ? `${id}-hint` : undefined}>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className={`grid gap-2 ${grid}`}>
        {options.map((o) => (
          <label key={o.value} className="atk-choice min-h-12 flex-col justify-center px-3 py-2 text-center">
            <input
              type="radio"
              className="visually-hidden"
              name={`${name}-${id}`}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span className="text-sm font-medium">{o.label}</span>
            {o.hint && <span className="mt-0.5 text-xs atk-muted">{o.hint}</span>}
          </label>
        ))}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-2 text-sm atk-muted">
          {hint}
        </p>
      )}
    </fieldset>
  );
}

export function Switch({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={`${id}-d`}
      className="atk-switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span id={`${id}-d`} className="block text-sm atk-muted">
          {description}
        </span>
      </span>
      <span className="atk-switch-track" aria-hidden="true" />
    </button>
  );
}

export function Range({
  label,
  value,
  min,
  max,
  step = 1,
  format = String,
  onChange,
  disabled,
  minLabel,
  maxLabel,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (n: number) => string;
  onChange: (value: number) => void;
  disabled?: boolean;
  minLabel?: string;
  maxLabel?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <output htmlFor={id} className="num font-display text-xl font-semibold">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="atk-range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="flex justify-between text-xs atk-muted" aria-hidden="true">
        <span>{minLabel ?? format(min)}</span>
        <span>{maxLabel ?? format(max)}</span>
      </div>
    </div>
  );
}
