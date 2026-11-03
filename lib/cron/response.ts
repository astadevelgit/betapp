import * as Sentry from "@sentry/nextjs";

import { ProviderNotConfiguredError } from "@/lib/provider/types";

export function cronErrorResponse(error: unknown, job: string): Response {
  Sentry.withScope((scope) => {
    scope.setTag("cron_job", job);
    scope.setContext("cron", { job });
    Sentry.captureException(error);
  });

  if (error instanceof ProviderNotConfiguredError) {
    return Response.json(
      { ok: false, error: error.message },
      { status: 503 },
    );
  }

  console.error("[cron]", error);

  return Response.json(
    {
      ok: false,
      error: error instanceof Error ? error.message : "Sync failed.",
    },
    { status: 500 },
  );
}
