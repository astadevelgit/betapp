export function formatCoins(value: number | string | bigint): string {
  return new Intl.NumberFormat("en-NG", {
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateOnly(value: string): string {
  return new Intl.DateTimeFormat("en-NG", {
    timeZone: "UTC",
    dateStyle: "long",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function formatKickoff(value: string | Date): string {
  return new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatKickoffTime(value: string | Date): string {
  return new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatMatchDay(value: string | Date): string {
  return new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatOdds(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "—";
}
