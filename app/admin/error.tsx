"use client";

import { ErrorState } from "@/components/system/error-state";

export default function AdminError({
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
      scope="admin"
      title="The admin console hit an error."
      description="The requested operation did not complete. Check the audit log and sync history, then try again."
    />
  );
}
