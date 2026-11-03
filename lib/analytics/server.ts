import "server-only";

import { randomUUID } from "node:crypto";

import { PostHog } from "posthog-node";

import type {
  AnalyticsEvent,
  AnalyticsProperties,
} from "./events";

const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

let client: PostHog | undefined;
let configured: boolean | undefined;

function getClient(): PostHog | null {
  if (configured === false) {
    return null;
  }

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

  if (!key) {
    configured = false;
    return null;
  }

  configured = true;
  client ??= new PostHog(key, {
    host: POSTHOG_HOST,
    // Serverless instances must not batch events across requests.
    flushAt: 1,
    flushInterval: 0,
    requestTimeout: 3000,
    fetchRetryCount: 0,
    enableExceptionAutocapture: false,
  });

  return client;
}

function reportFailure(error: unknown): void {
  console.error(
    "[analytics] Could not capture event",
    error instanceof Error ? error.message : error,
  );
}

/**
 * Capture a server-side product event. Analytics is optional: when no PostHog
 * key is configured this is a no-op, and failures never break the caller.
 *
 * Events with a real user must use the Supabase user ID as the distinct ID.
 * Never pass an email address as the distinct ID.
 */
export async function captureServerEvent(
  distinctId: string,
  event: AnalyticsEvent,
  properties: AnalyticsProperties = {},
): Promise<void> {
  const posthog = getClient();
  if (!posthog) return;

  try {
    await posthog.captureImmediate({
      distinctId,
      event,
      properties,
    });
  } catch (error) {
    reportFailure(error);
  }
}

/**
 * Capture an event that happens before a user exists (for example, a waitlist
 * submission). A random distinct ID keeps unrelated submissions separate while
 * `$process_person_profile: false` avoids creating person profiles for them.
 */
export async function captureAnonymousServerEvent(
  event: AnalyticsEvent,
  properties: AnalyticsProperties = {},
): Promise<void> {
  await captureServerEvent(randomUUID(), event, {
    ...properties,
    $process_person_profile: false,
  });
}
