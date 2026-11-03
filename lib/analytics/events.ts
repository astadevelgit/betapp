export const ANALYTICS_EVENTS = [
  "signup_started",
  "signup_completed",
  "login",
  "match_viewed",
  "bet_slip_add",
  "bet_placed",
  "bet_failed",
  "daily_claim",
  "bet_settled",
  "waitlist_join",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>;
