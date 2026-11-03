import type { PostHog } from "posthog-js";

import type {
  AnalyticsEvent,
  AnalyticsProperties,
} from "./events";

const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

let clientPromise: Promise<PostHog | null> | null = null;

/**
 * Lazily load PostHog so the analytics SDK stays out of the initial bundle.
 * Returns null when analytics is not configured, and never rejects.
 */
export function getPostHogClient(): Promise<PostHog | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    return Promise.resolve(null);
  }

  clientPromise ??= import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: POSTHOG_HOST,
        // App Router navigations use the History API. PostHog captures the
        // initial pageview and every subsequent history change for us, so no
        // usePathname() hook is required in the root layout.
        capture_pageview: "history_change",
        capture_pageleave: false,
        autocapture: false,
        capture_exceptions: false,
        disable_session_recording: true,
        disable_external_dependency_loading: true,
        person_profiles: "identified_only",
        respect_dnt: true,
      });

      return posthog;
    })
    .catch((error: unknown) => {
      console.error(
        "[analytics] Could not initialise PostHog",
        error instanceof Error ? error.message : error,
      );
      return null;
    });

  return clientPromise;
}

export async function captureClientEvent(
  event: AnalyticsEvent,
  properties: AnalyticsProperties = {},
): Promise<void> {
  const posthog = await getPostHogClient();
  posthog?.capture(event, properties);
}

export async function identifyClientUser(
  distinctId: string,
  properties: AnalyticsProperties = {},
): Promise<void> {
  const posthog = await getPostHogClient();
  posthog?.identify(distinctId, properties);
}
