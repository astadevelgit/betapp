import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseConfig, isSupabaseConfigured } from "./config";

export type ProxySessionResult = {
  response: NextResponse;
  userId: string | null;
};

/**
 * Refresh the Supabase session once per request and return the user id for
 * optimistic route protection. The authoritative checks live in the protected
 * layouts and Server Actions.
 */
export async function updateSupabaseSession(
  request: NextRequest,
): Promise<ProxySessionResult> {
  if (!isSupabaseConfigured()) {
    return {
      response: NextResponse.next({ request }),
      userId: null,
    };
  }

  let response = NextResponse.next({ request });
  const { url, anonKey } = getSupabaseConfig();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  try {
    const { data } = await supabase.auth.getClaims();
    const subject = data?.claims?.sub;

    return {
      response,
      userId: typeof subject === "string" ? subject : null,
    };
  } catch {
    return { response, userId: null };
  }
}
