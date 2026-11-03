"use client";

import { ErrorState } from "@/components/system/error-state";

export default function PublicError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <div className="page-shell py-16">
      <ErrorState error={error} retry={retry} scope="public" />
    </div>
  );
}
