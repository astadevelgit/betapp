"use client";

import { ErrorState } from "@/components/system/error-state";

export default function AuthenticatedError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <div className="py-10">
      <ErrorState error={error} retry={retry} scope="app" />
    </div>
  );
}
