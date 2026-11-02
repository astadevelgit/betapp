import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function startSyncRun(
  admin: SupabaseClient,
  job: string,
): Promise<string> {
  const { data, error } = await admin
    .from("sync_runs")
    .insert({ job, status: "running" })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Could not start sync run: ${error.message}`);
  }

  return data.id;
}

export async function finishSyncRun(
  admin: SupabaseClient,
  runId: string,
  status: "success" | "failed",
  recordsProcessed: number,
  metadata: Record<string, unknown>,
  error?: unknown,
): Promise<void> {
  const { error: updateError } = await admin
    .from("sync_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      records_processed: recordsProcessed,
      metadata,
      error: error
        ? (error instanceof Error ? error.message : String(error)).slice(0, 2000)
        : null,
    })
    .eq("id", runId);

  if (updateError) {
    console.error("[sync] Could not finish sync run", updateError.message);
  }
}
