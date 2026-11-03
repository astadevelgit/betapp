"use client";

import { ErrorState } from "@/components/system/error-state";

export default function AppError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <main className="page-shell flex min-h-dvh flex-col justify-center py-16">
      <ErrorState error={error} retry={retry} scope="root" />
    </main>
  );
}
