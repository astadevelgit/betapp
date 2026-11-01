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
