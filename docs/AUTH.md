# Authentication

## Flows

| Flow | Pages / code | Notes |
| --- | --- | --- |
| Sign-up | `/signup` | Email + password + confirmation. Client rules: valid email; 8 to 72 chars with a letter and a number. Email is trimmed and lower-cased. With confirmation off, the user is signed in and sent to `/dashboard`. |
| Duplicate sign-up | `/signup` | Detected from `user_already_exists` (confirmation off) or a user with zero identities (confirmation on). Message links to log in and reset password. |
| Login | `/login` | `?next=` is honoured only for same-site relative paths (`safeNextPath`). Errors are mapped to plain messages (`authErrorMessage`); raw Supabase errors are never shown. |
| Double submit | all forms | A ref guard plus a disabled, `aria-busy` button. |
| Session | `@supabase/ssr` cookies | Persist across reloads and browser restarts (cookie max-age set by the library). |
| Token refresh | `src/proxy.ts` (`getClaims`) and supabase-js in the browser | Expired access tokens are refreshed with the refresh token; invalid sessions are treated as signed out. |
| Route protection | `src/proxy.ts`, `src/lib/routes.ts` | Server-side, before render. `/dashboard/*`, `/reset-password` require a user; `/login`, `/signup`, `/forgot-password` redirect a signed-in user to `/dashboard`. |
| Logout | account menu, confirm dialog | `signOut()`, then a full navigation to `/login` so no cached signed-in page remains in the tab. Other tabs follow via `onAuthStateChange`. |
| Forgot password | `/forgot-password` | Always shows the same confirmation (no account enumeration); only rate limits/outages show an error. |
| Recovery link | `/auth/callback` (route handler) | `?code=` (PKCE, same browser) or `?token_hash=&type=recovery` (any browser). Sets the session cookie, then redirects to `/reset-password`. Bad links go to `/login?error=link_invalid`. |
| Dashboard-sent link | `AuthHashHandler` (root layout) | Links sent from the Supabase dashboard or admin API use the implicit flow (`#access_token=…`). The handler strips the hash, validates it with `setSession`, and routes recovery to `/reset-password`. |
| Set new password | `/reset-password` | Requires a session; `updateUser({ password })`. Also used for "Change password". |

## Supabase project settings (checked 2026-11-13)

- Auth -> Providers -> Email: enabled. **Confirm email: off** (`mailer_autoconfirm: true`), so new
  users can log in immediately. Turn it on for production if needed: the sign-up page already
  handles the "check your inbox" case.
- Sign-ups: enabled.
- JWT signing: asymmetric ES256 keys (JWKS). `SUPABASE_JWT_SECRET` is not needed.

## Redirect URLs

Auth -> URL Configuration:

- **Site URL**: the production web URL (currently falls back to `http://localhost:3000`).
- **Redirect URLs** (add all):
  - `http://localhost:3000/**`
  - `https://<your-vercel-domain>/**`
  - `https://*-<your-vercel-team>.vercel.app/**` (preview deployments, optional)

The app sends `redirectTo = <origin>/auth/callback?next=/reset-password` for recovery and
`<origin>/auth/callback` for sign-up confirmation. A URL not on the list falls back to the Site URL.

## Email templates

Default templates work with this app. For recovery links that open in **any** browser (not only the
one that requested it), change Auth -> Email Templates -> Reset Password to:

```html
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Reset password</a>
```

## Email delivery

The built-in Supabase mailer only sends to members of the Supabase project's team and is heavily
rate limited. Configure custom SMTP (Auth -> SMTP Settings, e.g. Resend or Postmark) before anyone
outside the team needs password recovery.

## Profiles

Each `auth.users` row gets a `public.profiles` row with the same UUID (trigger
`on_auth_user_created`). `GET /me` creates it if missing. See [PROJECT_SPEC.md](../PROJECT_SPEC.md#4-database).

## Account maintenance log

- 2026-11-13: removed two accounts after verifying each by user id and email: a never-confirmed
  account created with a typo in the owner's email address, and an earlier automated test account.
  All other accounts were kept. A password-reset email was requested for the owner's account so
  the owner can choose a new password themselves.
- Teammates create their own accounts through `/signup`; do not create accounts for each other.
  The project is shared, so never delete a user you did not create (the E2E suite only deletes its
  own `e2e-...@example.com` users).
