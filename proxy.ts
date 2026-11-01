import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

const protectedPrefixes = ["/my-bets", "/wallet", "/account", "/admin"];
const guestOnlyPrefixes = ["/auth/login", "/auth/register"];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function copyResponseCookies(from: NextResponse, to: NextResponse): void {
  for (const cookie of from.cookies.getAll()) {
    const { name, value, ...options } = cookie;
    to.cookies.set(name, value, options);
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { response, userId } = await updateSupabaseSession(request);

  if (!isSupabaseConfigured()) {
    return response;
  }

  const { pathname, search } = request.nextUrl;

  if (matchesPrefix(pathname, protectedPrefixes) && !userId) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);

    const redirect = NextResponse.redirect(loginUrl);
    copyResponseCookies(response, redirect);
    return redirect;
  }

  if (matchesPrefix(pathname, guestOnlyPrefixes) && userId) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";

    const redirect = NextResponse.redirect(homeUrl);
    copyResponseCookies(response, redirect);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
