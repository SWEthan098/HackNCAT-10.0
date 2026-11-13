"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { useFormField } from "@/components/auth/useFormField";
import { AuthShell } from "@/components/layout/AuthShell";
import { Alert, Button, Field, PasswordField } from "@/components/ui";
import { authErrorMessage, normalizeEmail, validateEmail } from "@/lib/auth/validation";
import { ROUTES, safeNextPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";

const NOTICES: Record<string, { tone: "info" | "error"; text: string }> = {
  expired: { tone: "info", text: "Your session has expired. Log in again to continue." },
  password_updated: { tone: "info", text: "Password updated. Log in with your new password." },
  link_invalid: { tone: "error", text: "That link is invalid or has expired. Request a new one." },
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const notice = NOTICES[params.get("error") ?? params.get("reason") ?? ""];

  const email = useFormField(validateEmail);
  const password = useFormField((v) => (v ? null : "Enter your password."));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return; // guard against double submit (Enter + click)
    const invalid = [email.check(), password.check()].some(Boolean);
    if (invalid) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    const { error: authError } = await createClient().auth.signInWithPassword({
      email: normalizeEmail(email.value),
      password: password.value,
    });
    if (authError) {
      setError(authErrorMessage(authError));
      setLoading(false);
      inFlight.current = false;
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-1" aria-describedby={error ? "login-error" : undefined}>
      {notice && (
        <Alert tone={notice.tone} className="mb-4">
          {notice.text}
        </Alert>
      )}
      <Field
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        required
        error={email.error}
        {...email.inputProps}
      />
      <PasswordField
        label="Password"
        name="password"
        id="login-password"
        autoComplete="current-password"
        required
        error={password.error}
        {...password.inputProps}
      />
      <div className="-mt-1 mb-4 flex justify-end">
        <Link href={ROUTES.forgotPassword} className="text-sm text-accent underline-offset-4 hover:underline">
          Forgot password?
        </Link>
      </div>
      {error && (
        <div id="login-error" className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <Button type="submit" size="lg" loading={loading} className="w-full">
        {loading ? "Logging in" : "Log in"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell
      title="Log in"
      description="Use the email and password you signed up with."
      footer={
        <>
          New here?{" "}
          <Link href={ROUTES.signup} className="text-accent underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
