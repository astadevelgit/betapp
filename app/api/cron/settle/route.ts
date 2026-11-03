import { checkCronAuthorization } from "@/lib/cron/auth";
import { cronErrorResponse } from "@/lib/cron/response";
import { settleFinishedBets } from "@/lib/settlement/settle";

export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = checkCronAuthorization(request);
  if (denied) {
    return denied;
  }

  try {
    const result = await settleFinishedBets();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return cronErrorResponse(error, "settle");
  }
}
