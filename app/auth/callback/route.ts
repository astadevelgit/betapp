import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/redirect";
import {
  getSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function failure(origin: string, reason: string): NextResponse {
  const url = new URL("/auth/login", origin);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const { origin, searchParams } = url;

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"), "/");

  if (searchParams.get("error")) {
    return failure(origin, "link_expired");
  }

  if (!code && !(tokenHash && type)) {
    return failure(origin, "missing_code");
  }

  try {
    const supabase = await createSupabaseServerClient();

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("[auth] Code exchange failed", error.message);
        return failure(origin, "link_expired");
      }
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });

      if (error) {
        console.error("[auth] OTP verification failed", error.message);
        return failure(origin, "link_expired");
      }
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && isSupabaseAdminConfigured()) {
      const admin = getSupabaseAdminClient();
      const { error } = await admin.rpc("grant_signup_bonus", {
        p_user_id: user.id,
      });

      if (error) {
        console.error("[auth] Signup bonus grant failed", error.message);
      }
    }

    return NextResponse.redirect(new URL(next, origin));
  } catch (error) {
    console.error("[auth] Callback failed", error);
    return failure(origin, "callback_failed");
  }
}
