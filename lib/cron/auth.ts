import { timingSafeEqual } from "node:crypto";

/**
 * Vercel cron sends `Authorization: Bearer <CRON_SECRET>`. Fail closed when the
 * secret is not configured so an accidentally public cron route cannot run.
 */
export function checkCronAuthorization(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return Response.json(
      { ok: false, error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization");
  const provided =
    header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  const querySecret = new URL(request.url).searchParams.get("secret");
  const candidate = provided ?? querySecret ?? "";

  if (!constantTimeEqual(candidate, secret)) {
    return Response.json(
      { ok: false, error: "Unauthorized." },
      { status: 401 },
    );
  }

  return null;
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
