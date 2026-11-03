import { checkCronAuthorization } from "@/lib/cron/auth";
import { cronErrorResponse } from "@/lib/cron/response";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { finishSyncRun, startSyncRun } from "@/lib/sync-runs";

export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = checkCronAuthorization(request);
  if (denied) {
    return denied;
  }

  let admin: ReturnType<typeof getSupabaseAdminClient> | null = null;
  let runId: string | null = null;

  try {
    admin = getSupabaseAdminClient();
    runId = await startSyncRun(admin, "cleanup");

    const [rateLimits, unverified] = await Promise.all([
      admin.rpc("purge_expired_rate_limits"),
      admin.rpc("purge_unverified_profiles", { p_max_age_hours: 24 }),
    ]);

    if (rateLimits.error) {
      throw new Error(
        `Could not purge rate limits: ${rateLimits.error.message}`,
      );
    }

    if (unverified.error) {
      throw new Error(
        `Could not purge unverified profiles: ${unverified.error.message}`,
      );
    }

    const rateLimitBucketsDeleted = Number(rateLimits.data ?? 0);
    const unverifiedProfilesDeleted = Number(unverified.data ?? 0);

    await finishSyncRun(
      admin,
      runId,
      "success",
      rateLimitBucketsDeleted + unverifiedProfilesDeleted,
      {
        rateLimitBucketsDeleted,
        unverifiedProfilesDeleted,
      },
    );

    return Response.json({
      ok: true,
      rateLimitBucketsDeleted,
      unverifiedProfilesDeleted,
    });
  } catch (error) {
    if (admin && runId) {
      await finishSyncRun(admin, runId, "failed", 0, {}, error);
    }

    return cronErrorResponse(error, "cleanup");
  }
}
