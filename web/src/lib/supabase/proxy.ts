import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ROUTES, isGuestOnly, isProtected } from "@/lib/routes";

/**
 * Runs on every matched request (see src/proxy.ts):
 * 1. Refreshes an expired access token using the refresh token cookie, and writes the
 *    new cookies to both the request (for this render) and the response (for the browser).
 * 2. Verifies the session with getClaims() (signature checked against the project's JWKS),
 *    never trusting the cookie contents on their own.
 * 3. Redirects: protected route without a user -> /login?next=..., guest-only route with a
 *    user -> /dashboard.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims(): it is what refreshes tokens.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    Object.entries(params ?? {}).forEach(([k, v]) => url.searchParams.set(k, v));
    const redirect = NextResponse.redirect(url);
    // Carry refreshed/cleared auth cookies over to the redirect response.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!signedIn && isProtected(pathname)) {
    return redirectTo(ROUTES.login, { next: pathname + search });
  }
  if (signedIn && isGuestOnly(pathname)) {
    return redirectTo(ROUTES.dashboard);
  }
  return response;
}
