import { checkCronAuthorization } from "@/lib/cron/auth";
import { cronErrorResponse } from "@/lib/cron/response";
import { syncLive } from "@/lib/provider/sync";

export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = checkCronAuthorization(request);
  if (denied) {
    return denied;
  }

  try {
    const result = await syncLive();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return cronErrorResponse(error, "sync-live");
  }
}
