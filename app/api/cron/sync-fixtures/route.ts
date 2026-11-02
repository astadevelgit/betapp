import { checkCronAuthorization } from "@/lib/cron/auth";
import { cronErrorResponse } from "@/lib/cron/response";
import { syncFixtures } from "@/lib/provider/sync";

export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = checkCronAuthorization(request);
  if (denied) {
    return denied;
  }

  try {
    const result = await syncFixtures();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return cronErrorResponse(error);
  }
}
