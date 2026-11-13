"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useFormField } from "@/components/auth/useFormField";
import { AuthShell } from "@/components/layout/AuthShell";
import { Alert, Button, Field } from "@/components/ui";
import { authErrorMessage, normalizeEmail, validateEmail } from "@/lib/auth/validation";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const email = useFormField(validateEmail);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current || email.check()) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    const address = normalizeEmail(email.value);
    const { error: authError } = await createClient().auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}${ROUTES.authCallback}?next=${ROUTES.resetPassword}`,
    });
    setLoading(false);
    inFlight.current = false;
    // Same message whether or not the account exists, so this form can't be used to
    // discover which emails are registered. Only rate limits and outages are surfaced.
    if (authError && (authError.status === 429 || authError.status === undefined || authError.status >= 500)) {
      setError(authErrorMessage(authError));
      return;
    }
    setSentTo(address);
  }

  return (
    <AuthShell
      title="Reset your password"
      description="We'll email you a link to choose a new password."
      footer={
        <Link href={ROUTES.login} className="text-accent underline-offset-4 hover:underline">
          Back to log in
        </Link>
      }
    >
      {sentTo ? (
        <Alert tone="success" title="Check your email">
          If an account exists for {sentTo}, a reset link is on its way. Open it in this browser. The link
          expires after an hour.
        </Alert>
      ) : (
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-1">
          <Field label="Email" type="email" name="email" autoComplete="email" inputMode="email" required error={email.error} {...email.inputProps} />
          {error && (
            <div className="mb-4">
              <Alert tone="error">{error}</Alert>
            </div>
          )}
          <Button type="submit" size="lg" loading={loading} className="w-full">
            {loading ? "Sending link" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
