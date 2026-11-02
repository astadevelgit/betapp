import type { Metadata } from "next";
import { connection } from "next/server";
import { ScrollText } from "lucide-react";

import { AdminConfigNotice } from "@/components/admin/admin-config-notice";
import { Badge } from "@/components/ui/badge";
import { getAdminAuditLogs } from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Admin audit log",
};

export const instant = false;

export default async function AdminAuditPage() {
  await connection();
  await requireAdmin();

  if (!isSupabaseAdminConfigured()) {
    return <AdminConfigNotice />;
  }

  const logs = await getAdminAuditLogs();

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Operations</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Audit log
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Manual settlements, voids, and future admin actions are recorded with
          the operator, a required reason, and before/after snapshots.
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/40 px-6 py-16 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-brand/20 bg-brand/10 text-brand">
            <ScrollText className="size-6" />
          </span>
          <p className="mt-4 text-base font-semibold">No admin actions yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Settle or void a bet from the Bets screen and the audit trail will
            appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <article
              key={log.id}
              className="rounded-xl border border-border/80 bg-card/70 p-4"
            >
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className="border-brand/30 bg-brand/10 text-[0.6rem] text-brand"
                    >
                      {log.action.replaceAll("_", " ")}
                    </Badge>
                    <Badge variant="outline" className="text-[0.6rem]">
                      {log.entity}
                    </Badge>
                    {log.entityId ? (
                      <span className="font-mono text-[0.62rem] text-muted-foreground">
                        #{log.entityId.slice(0, 8)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-sm font-medium">
                    {log.admin?.displayName ?? "System"}
                    {log.admin?.email ? (
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        · {log.admin.email}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[0.65rem] text-muted-foreground">
                    {formatDateTime(log.createdAt)}
                  </p>
                </div>
              </div>

              <p className="mt-3 rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
                <span className="font-medium text-foreground">Reason:</span>{" "}
                {log.reason ?? "No reason recorded."}
              </p>

              <details className="mt-2 text-[0.68rem] text-muted-foreground">
                <summary className="cursor-pointer select-none font-medium text-foreground/80 hover:text-foreground">
                  Before and after
                </summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <pre className="max-h-48 overflow-auto rounded-lg border border-border/70 bg-background/60 p-2.5 text-[0.62rem] leading-4">
                    {JSON.stringify(log.before, null, 2)}
                  </pre>
                  <pre className="max-h-48 overflow-auto rounded-lg border border-border/70 bg-background/60 p-2.5 text-[0.62rem] leading-4">
                    {JSON.stringify(log.after, null, 2)}
                  </pre>
                </div>
              </details>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
