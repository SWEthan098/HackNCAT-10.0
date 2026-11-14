"use client";

// OWNER: Jordan (P4). PUBLIC audience page (the QR code lands here). TOP PRIORITY.
// STUB: "Trick the AI" form against the stub /attack endpoint.
// TODO(Jordan): Attack Picker cards (Password Guessing, Fake Boss Message, Trick the AI,
// Full Attack) via POST /playground/launch, animated layers, appeal button, rate-limit countdown.
// SECURITY: render every reply and attacker text as PLAIN TEXT. No images, no unknown links.

import { useState } from "react";
import { Disclaimer } from "@/components/kairos/Disclaimer";
import { Wordmark } from "@/components/layout/Wordmark";
import { Button, Field } from "@/components/ui";
import { ApiError, apiFetch } from "@/lib/api";
import type { AttackResponse } from "@/lib/types/kairos";

export default function AttackPage() {
  // Codename is created on first launch (not during render): Next.js prerenders this page.
  const [nickname, setNickname] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<AttackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function launch() {
    setBusy(true);
    setError(null);
    const codename = nickname ?? `agent-${crypto.randomUUID().slice(0, 5)}`;
    setNickname(codename);
    try {
      setResult(await apiFetch<AttackResponse>("/attack", { method: "POST", body: { message, nickname: codename } }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <Wordmark />
      <h1 className="mt-6 text-2xl">Join the Kairos Red Team</h1>
      <p className="mt-2 text-ink-2">Make the finance AI leak the vault code, or email payroll outside cisco.example.</p>
      <p className="mt-1 text-sm text-muted">
        {nickname ? `You are ${nickname}.` : "You get a codename when you launch your first attack."}
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <Field label="Your attack" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} />
        <Button onClick={launch} loading={busy} disabled={!message.trim()}>
          Launch attack
        </Button>
      </div>
      <div aria-live="polite" className="mt-6">
        {error && <p className="text-error">{error}</p>}
        {result && (
          <div className="rounded-card border border-rule bg-paper p-4">
            <p className="font-medium">{result.verdict === "blocked" ? "Blocked" : "Allowed"}</p>
            <p className="mt-1 text-sm">{result.reason}</p>
            <ul className="mt-3 text-sm">
              {result.layers.map((l) => (
                <li key={l.name}>
                  {l.name.replace("_", " ")}: {l.status}
                </li>
              ))}
            </ul>
            {result.technique && (
              <p className="mt-3 text-xs text-muted">
                {result.technique.technique_id} {result.technique.name}
              </p>
            )}
          </div>
        )}
      </div>
      <p className="mt-8 text-xs text-muted">
        Your message may appear on screen (filtered). We store only the attack text, no personal info, and delete it
        after the event.
      </p>
      <Disclaimer />
    </main>
  );
}
