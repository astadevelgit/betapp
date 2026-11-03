import * as Sentry from "@sentry/nextjs";

import { getPostHogClient } from "@/lib/analytics/client";

// Load PostHog after the document is ready but before hydration. The SDK
// captures pageviews from History API changes, which matches App Router
// navigation without a blocking usePathname() hook.
void getPostHogClient();

const dsn =
  process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  // Keep PII and request bodies out of Sentry by default.
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  enableLogs: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
