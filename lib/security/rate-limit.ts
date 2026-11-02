import "server-only";

import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

function clientIp(headerStore: Headers): string {
  // Vercel sets x-real-ip to the connecting client. Fall back to the first
  // x-forwarded-for entry for other hosts.
  const realIp = headerStore.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = headerStore.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  return first || "unknown";
}

/**
 * Hash the client IP before it reaches Postgres. The salt is optional; when it
 * is absent we reuse CRON_SECRET, which is already a server-only secret.
 */
export async function hashClientIp(): Promise<string> {
  const headerStore = await headers();
  const salt =
    process.env.RATE_LIMIT_SALT ?? process.env.CRON_SECRET ?? "betapp";

  return createHash("sha256")
    .update(`${salt}:${clientIp(headerStore)}`)
    .digest("hex");
}

/**
 * Consume one slot in a fixed-window bucket. The RPC is atomic, so parallel
 * requests cannot race past the limit. Callers decide whether to fail open or
 * closed if this throws.
 */
export async function consumeRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    throw new Error(`Rate limit check failed: ${error.message}`);
  }

  const payload = (data ?? {}) as {
    allowed?: unknown;
    remaining?: unknown;
    reset_at?: unknown;
  };

  if (typeof payload.allowed !== "boolean") {
    throw new Error("Rate limit check returned an invalid response.");
  }

  const resetAt =
    typeof payload.reset_at === "string" ? Date.parse(payload.reset_at) : NaN;
  const retryAfterSeconds = Number.isFinite(resetAt)
    ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
    : windowSeconds;

  return {
    allowed: payload.allowed,
    remaining: Number(payload.remaining ?? 0),
    retryAfterSeconds,
  };
}
