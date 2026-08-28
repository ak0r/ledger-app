// Route protection (2026-08-19 Family/Application Architecture delta §6).
// Next 16 renamed/deprecated middleware.ts to proxy.ts — this file must
// live beside src/app/, i.e. directly in src/.
//
// Proxy defaults to the Node.js runtime in Next 16 (not Edge), so importing
// appDb (better-sqlite3-backed) here directly is safe.
//
// This is convenience/UX-layer only: Next's own proxy.js docs warn that
// Server Actions aren't separate routes and can silently bypass a proxy
// matcher ("Always verify authentication and authorization inside each
// Server Function rather than relying on Proxy alone") — this codebase's
// rule #17 one layer up. Every protected action/layout independently
// re-derives the current AppUser via getCurrentAppUser()/requireProfileAccess,
// never trusting that proxy already gated the request.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/session";
import { db } from "@/server/db/client";
import { findSessionById } from "@/server/repositories/sessions";

export function proxy(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = sessionId ? findSessionById(db, sessionId) : undefined;
  const valid = session !== undefined && new Date(session.expiresAt).getTime() > Date.now();

  if (!valid) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/setup",
    "/accounts/:path*",
    "/transactions/:path*",
    "/imports/:path*",
    "/settings/:path*",
  ],
};
