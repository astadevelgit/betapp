/**
 * Only allow relative, same-origin paths. Prevents open redirects through the
 * ?next= query parameter.
 */
export function safeNextPath(
  value: FormDataEntryValue | string | null | undefined,
  fallback = "/",
): string {
  if (typeof value !== "string") {
    return fallback;
  }

  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }

  return value;
}
