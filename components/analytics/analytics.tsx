"use client";

import { useEffect, useMemo, useRef } from "react";

import {
  captureClientEvent,
  identifyClientUser,
} from "@/lib/analytics/client";
import type {
  AnalyticsEvent,
  AnalyticsProperties,
} from "@/lib/analytics/events";

/**
 * Identifies the signed-in user by Supabase ID only. Email addresses and other
 * display PII must never be sent to PostHog.
 */
export function AnalyticsIdentify({
  distinctId,
  role,
}: {
  distinctId: string;
  role?: string;
}) {
  useEffect(() => {
    void identifyClientUser(distinctId, role ? { role } : {});
  }, [distinctId, role]);

  return null;
}

/** Fires a single product event when a server-rendered page is viewed. */
export function TrackEvent({
  event,
  properties,
}: {
  event: AnalyticsEvent;
  properties?: AnalyticsProperties;
}) {
  const serialized = useMemo(
    () => JSON.stringify(properties ?? {}),
    [properties],
  );
  const lastFired = useRef<string | null>(null);

  useEffect(() => {
    const key = `${event}:${serialized}`;
    if (lastFired.current === key) return;

    lastFired.current = key;
    void captureClientEvent(event, JSON.parse(serialized) as AnalyticsProperties);
  }, [event, serialized]);

  return null;
}
