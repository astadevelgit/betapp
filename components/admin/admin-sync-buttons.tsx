"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { runSyncJobAction } from "@/lib/admin/actions";
import type { AdminSyncJob } from "@/lib/admin/types";

const JOBS: Array<{ job: AdminSyncJob; label: string }> = [
  { job: "fixtures", label: "Sync fixtures" },
  { job: "live", label: "Sync live" },
  { job: "odds", label: "Sync odds" },
];

export function AdminSyncButtons() {
  const router = useRouter();
  const [pendingJob, setPendingJob] = useState<AdminSyncJob | null>(null);
  const [pending, startTransition] = useTransition();

  function run(job: AdminSyncJob) {
    if (pending) return;
    setPendingJob(job);

    startTransition(async () => {
      const result = await runSyncJobAction(job);

      if (!result.ok) {
        toast.error(result.message);
      } else {
        toast.success(result.message);
        router.refresh();
      }

      setPendingJob(null);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {JOBS.map(({ job, label }) => (
        <Button
          key={job}
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(job)}
        >
          {pendingJob === job ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {label}
        </Button>
      ))}
    </div>
  );
}
