import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { ROUTES, safeNextPath } from "@/lib/routes";

// Landing point for links in Supabase auth emails (password recovery, email confirmation).
// Supports both link styles:
//   ?code=...                      PKCE flow (default for @supabase/ssr; same browser only)
//   ?token_hash=...&type=recovery  token-hash flow (works in any browser; needs the email
//                                  template to link here, see docs/AUTH.md)
// On success the session cookies are set and the user goes to `next` (relative paths only).
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"), type === "recovery" ? ROUTES.resetPassword : ROUTES.dashboard);

  const success = NextResponse.redirect(new URL(next, request.url));
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) => success.cookies.set(name, value, options)),
      },
    },
  );

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }
  if (ok) return success;

  const failure = new URL(ROUTES.login, request.url);
  failure.searchParams.set("error", "link_invalid");
  return NextResponse.redirect(failure);
}
