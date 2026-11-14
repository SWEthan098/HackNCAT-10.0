"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useFormField } from "@/components/auth/useFormField";
import { AuthShell } from "@/components/layout/AuthShell";
import { Alert, Button, Field, PasswordField } from "@/components/ui";
import {
  PASSWORD_MIN,
  authErrorMessage,
  isDuplicateSignup,
  normalizeEmail,
  validateConfirm,
  validateEmail,
  validatePassword,
} from "@/lib/auth/validation";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";

type Result = { tone: "error" | "success"; text: string; duplicate?: boolean } | null;

export default function SignupPage() {
  const router = useRouter();
  const email = useFormField(validateEmail);
  const password = useFormField(validatePassword);
  const confirm = useFormField((v) => validateConfirm(password.value, v));
  const [result, setResult] = useState<Result>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    const invalid = [email.check(), password.check(), confirm.check()].some(Boolean);
    if (invalid) return;
    inFlight.current = true;
    setLoading(true);
    setResult(null);

    const { data, error } = await createClient().auth.signUp({
      email: normalizeEmail(email.value),
      password: password.value,
      options: { emailRedirectTo: `${window.location.origin}${ROUTES.authCallback}` },
    });

    const done = (r: Result) => {
      setResult(r);
      setLoading(false);
      inFlight.current = false;
    };
    const duplicate = error?.code === "user_already_exists" || error?.code === "email_exists" || isDuplicateSignup(data?.user);
    if (duplicate) return done({ tone: "error", duplicate: true, text: "An account with this email already exists." });
    if (error) return done({ tone: "error", text: authErrorMessage(error) });
    if (data.session) {
      router.replace(ROUTES.console);
      router.refresh();
      return;
    }
    // Email confirmation is enabled on this Supabase project.
    done({ tone: "success", text: "Check your inbox to confirm your email, then log in." });
  }

  return (
    <AuthShell
      title="Create your account"
      description="Your account is saved in Supabase, so you can log back in any time."
      footer={
        <>
          Already have an account?{" "}
          <Link href={ROUTES.login} className="text-accent underline-offset-4 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-1">
        <Field label="Email" type="email" name="email" autoComplete="email" inputMode="email" required error={email.error} {...email.inputProps} />
        <PasswordField
          label="Password"
          name="new-password"
          id="signup-password"
          autoComplete="new-password"
          required
          helper={`At least ${PASSWORD_MIN} characters, with a letter and a number.`}
          error={password.error}
          {...password.inputProps}
        />
        <PasswordField
          label="Confirm password"
          name="confirm-password"
          id="signup-confirm"
          autoComplete="new-password"
          required
          error={confirm.error}
          {...confirm.inputProps}
        />
        {result && (
          <div className="mb-4">
            <Alert tone={result.tone}>
              {result.text}
              {result.duplicate && (
                <>
                  {" "}
                  <Link href={ROUTES.login} className="text-accent underline underline-offset-4">
                    Log in
                  </Link>{" "}
                  or{" "}
                  <Link href={ROUTES.forgotPassword} className="text-accent underline underline-offset-4">
                    reset your password
                  </Link>
                  .
                </>
              )}
            </Alert>
          </div>
        )}
        <Button type="submit" size="lg" loading={loading} className="w-full">
          {loading ? "Creating account" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
