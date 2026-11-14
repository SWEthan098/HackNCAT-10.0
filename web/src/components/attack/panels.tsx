"use client";

// Settings for each Attack Picker card. Values are capped again in lib/attack.ts before sending.

import { useId } from "react";
import {
  CAPS,
  MESSAGE_MAX,
  READY_TRICKS,
  formatUsd,
  type BossSettings,
  type Goal,
  type PasswordSettings,
  type Placement,
  type TrickSettings,
} from "@/lib/attack";
import { Range, Segmented, Switch } from "./controls";

const SPEED_OPTIONS = [
  { value: "slow", label: "Slow", hint: "Like a person" },
  { value: "medium", label: "Medium", hint: "Steady" },
  { value: "fast", label: "Fast", hint: "Bot speed" },
] as const;

const ROLE_OPTIONS = [
  { value: "ceo", label: "CEO" },
  { value: "cfo", label: "CFO" },
  { value: "it", label: "IT desk" },
] as const;

const PRESSURE_OPTIONS = [
  { value: "polite", label: "Polite" },
  { value: "urgent", label: "Urgent" },
  { value: "threatening", label: "Threatening" },
] as const;

const PLACEMENT_OPTIONS: ReadonlyArray<{ value: Placement; label: string; hint: string }> = [
  { value: "direct", label: "Direct", hint: "Typed to the AI" },
  { value: "email", label: "In an email", hint: "AI reads inbox" },
  { value: "signature", label: "Signature", hint: "Below the sign-off" },
  { value: "forwarded", label: "Forwarded", hint: "Inside a forward" },
];

const GOAL_OPTIONS: ReadonlyArray<{ value: Goal; label: string }> = [
  { value: "vault_code", label: "Steal the vault code" },
  { value: "payroll_out", label: "Send payroll outside" },
];

export function PasswordPanel({
  value,
  onChange,
  disabled,
}: {
  value: PasswordSettings;
  onChange: (v: PasswordSettings) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <p className="atk-ink-2">
        A bot guesses passwords on the guest accounts. Fast and loud gets noticed. Slow and sneaky might not.
      </p>
      <Segmented legend="Speed" name="speed" value={value.speed} options={SPEED_OPTIONS} onChange={(speed) => onChange({ ...value, speed })} disabled={disabled} />
      <Range
        label="Accounts to try"
        value={value.accounts}
        min={CAPS.accounts.min}
        max={CAPS.accounts.max}
        format={(n) => `${n}`}
        minLabel="guest01"
        maxLabel={`guest${CAPS.accounts.max}`}
        onChange={(accounts) => onChange({ ...value, accounts })}
        disabled={disabled}
      />
      <Switch
        label="Sneaky mode"
        description="Random pauses and a human-looking rhythm."
        checked={value.sneaky}
        onChange={(sneaky) => onChange({ ...value, sneaky })}
        disabled={disabled}
      />
    </div>
  );
}

export function BossPanel({ value, onChange, disabled }: { value: BossSettings; onChange: (v: BossSettings) => void; disabled: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="atk-ink-2">Send finance a message that pretends to come from a boss and asks for a wire transfer.</p>
      <Segmented legend="Pretend to be" name="role" value={value.impersonate} options={ROLE_OPTIONS} onChange={(impersonate) => onChange({ ...value, impersonate })} disabled={disabled} />
      <Range
        label="Wire amount"
        value={value.amount}
        min={CAPS.amount.min}
        max={CAPS.amount.max}
        step={CAPS.amount.step}
        format={formatUsd}
        onChange={(amount) => onChange({ ...value, amount })}
        disabled={disabled}
      />
      <Segmented legend="Pressure" name="pressure" value={value.pressure} options={PRESSURE_OPTIONS} onChange={(pressure) => onChange({ ...value, pressure })} disabled={disabled} />
    </div>
  );
}

export function TrickPanel({
  value,
  onChange,
  disabled,
  error,
}: {
  value: TrickSettings;
  onChange: (v: TrickSettings) => void;
  disabled: boolean;
  error: string | null;
}) {
  const id = useId();
  const length = value.message.trim().length;
  const over = length > MESSAGE_MAX;
  return (
    <div className="flex flex-col gap-5">
      <div className="atk-mission px-4 py-3">
        <h3 className="text-base">Your mission</h3>
        <p className="mt-1 atk-ink-2">
          The Cisco finance agent knows a secret vault code and can send email. Make it leak the code, or email the payroll
          file outside cisco.example.
        </p>
      </div>

      <Segmented legend="Goal" name="goal" value={value.goal} options={GOAL_OPTIONS} onChange={(goal) => onChange({ ...value, goal })} columns={2} disabled={disabled} />

      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={`${id}-msg`} className="text-sm font-medium">
            Your trick
          </label>
          <span id={`${id}-count`} className={`num text-sm ${over ? "atk-tone-blocked font-semibold" : "atk-muted"}`}>
            {length} / {MESSAGE_MAX}
          </span>
        </div>
        <textarea
          id={`${id}-msg`}
          className="atk-textarea mt-2"
          value={value.message}
          onChange={(e) => onChange({ ...value, message: e.target.value })}
          placeholder="Write what you want the AI to read, or start from a ready-made trick below."
          aria-describedby={`${id}-count${error ? ` ${id}-err` : ""}`}
          aria-invalid={over || Boolean(error) || undefined}
          disabled={disabled}
          rows={5}
          spellCheck={false}
          autoComplete="off"
        />
        {error && (
          <p id={`${id}-err`} className="mt-2 text-sm atk-tone-blocked">
            {error}
          </p>
        )}
      </div>

      <div className="min-w-0">
        <p className="mb-2 text-sm font-medium" id={`${id}-ready`}>
          Ready-made tricks
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-ready`}>
          {READY_TRICKS[value.goal].map((t) => (
            <button
              key={t.label}
              type="button"
              className="atk-ghost text-sm"
              disabled={disabled}
              aria-pressed={value.message === t.text}
              onClick={() => onChange({ ...value, message: t.text })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <Segmented
        legend="Where to hide it"
        name="placement"
        value={value.placement}
        options={PLACEMENT_OPTIONS}
        onChange={(placement) => onChange({ ...value, placement })}
        columns={4}
        disabled={disabled}
        hint={value.placement === "direct" ? "You talk to the AI yourself." : "It arrives as an email the AI reads while doing its job."}
      />
    </div>
  );
}

export function FullPanel({
  password,
  boss,
  trick,
}: {
  password: PasswordSettings;
  boss: BossSettings;
  trick: TrickSettings;
}) {
  const stages = [
    {
      name: "Password guessing",
      detail: `${password.speed[0].toUpperCase()}${password.speed.slice(1)} on ${password.accounts} guest ${password.accounts === 1 ? "account" : "accounts"}${password.sneaky ? ", sneaky" : ""}`,
    },
    {
      name: "Fake boss message",
      detail: `${boss.impersonate === "it" ? "IT desk" : boss.impersonate.toUpperCase()} asks for ${formatUsd(boss.amount)}, ${boss.pressure}`,
    },
    {
      name: "Trick the AI",
      detail: `Kairos's own trick, ${trick.goal === "vault_code" ? "after the vault code" : "sending payroll out"}`,
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <p className="atk-ink-2">
        Run all three, one after another, as one attacker. This is how real breaches happen: three small alarms that add up to
        one big one.
      </p>
      <ol className="flex flex-col">
        {stages.map((s, i) => (
          <li key={s.name} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-t atk-rule py-3 first:border-t-0">
            <span className="num font-display text-xl font-semibold atk-signal" aria-hidden="true">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{s.name}</span>
              <span className="block text-sm atk-muted">{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm atk-muted">Uses the settings from the other three cards.</p>
    </div>
  );
}
