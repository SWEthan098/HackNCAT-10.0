"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useFormField } from "@/components/auth/useFormField";
import { AuthShell } from "@/components/layout/AuthShell";
import { Alert, Button, ButtonLink, PasswordField } from "@/components/ui";
import { PASSWORD_MIN, authErrorMessage, validateConfirm, validatePassword } from "@/lib/auth/validation";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";

// Reached from a recovery email (via /auth/callback, which signs the user in) or from
// "Change password" in the account menu. The proxy only lets signed-in users in.
export default function ResetPasswordPage() {
  const router = useRouter();
  const password = useFormField(validatePassword);
  const confirm = useFormField((v) => validateConfirm(password.value, v));
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    if ([password.check(), confirm.check()].some(Boolean)) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    const { error: authError } = await createClient().auth.updateUser({ password: password.value });
    setLoading(false);
    inFlight.current = false;
    if (authError) {
      if (authError.code === "session_not_found" || authError.status === 401) {
        router.replace(`${ROUTES.login}?reason=expired`);
        return;
      }
      setError(authErrorMessage(authError));
      return;
    }
    password.reset();
    confirm.reset();
    setDone(true);
  }

  return (
    <AuthShell title="Choose a new password" description="This replaces your current password everywhere.">
      {done ? (
        <div className="flex flex-col gap-4">
          <Alert tone="success" title="Password updated">
            Use your new password the next time you log in.
          </Alert>
          <ButtonLink href={ROUTES.console} size="lg" className="w-full">
            Go to the console
          </ButtonLink>
        </div>
      ) : (
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-1">
          <PasswordField
            label="New password"
            name="new-password"
            id="reset-password"
            autoComplete="new-password"
            required
            helper={`At least ${PASSWORD_MIN} characters, with a letter and a number.`}
            error={password.error}
            {...password.inputProps}
          />
          <PasswordField
            label="Confirm new password"
            name="confirm-password"
            id="reset-confirm"
            autoComplete="new-password"
            required
            error={confirm.error}
            {...confirm.inputProps}
          />
          {error && (
            <div className="mb-4">
              <Alert tone="error">{error}</Alert>
            </div>
          )}
          <Button type="submit" size="lg" loading={loading} className="w-full">
            {loading ? "Saving" : "Update password"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
