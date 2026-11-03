"use client";

import { ErrorState } from "@/components/system/error-state";

export default function AuthError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <ErrorState
      error={error}
      retry={retry}
      scope="auth"
      className="border-0 bg-transparent px-0 shadow-none"
    />
  );
}
