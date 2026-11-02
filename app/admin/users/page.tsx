import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { Search, Users } from "lucide-react";

import { AdminConfigNotice } from "@/components/admin/admin-config-notice";
import { AdminUserActions } from "@/components/admin/admin-user-actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getAdminUsers,
  type AdminUserFilter,
  type AdminUserRow,
} from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { formatCoins, formatDateTime } from "@/lib/format";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Admin users",
};

export const instant = false;

const FILTERS: Array<{ value: AdminUserFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "deleted", label: "Deleted" },
];

const STATUS_STYLES: Record<
  AdminUserRow["status"],
  { label: string; className: string }
> = {
  active: {
    label: "Active",
    className: "border-brand/30 bg-brand/10 text-brand",
  },
  suspended: {
    label: "Suspended",
    className: "border-warning/30 bg-warning/10 text-warning",
  },
  deleted: {
    label: "Deleted",
    className: "border-border bg-muted text-muted-foreground",
  },
};

function resolveFilter(value: string | undefined): AdminUserFilter {
  return value === "active" || value === "suspended" || value === "deleted"
    ? value
    : "all";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await connection();
  const context = await requireAdmin();

  if (!isSupabaseAdminConfigured()) {
    return <AdminConfigNotice />;
  }

  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const filter = resolveFilter(params.status);
  const users = await getAdminUsers({ search, status: filter });

  const active = users.filter((user) => user.status === "active").length;
  const suspended = users.filter((user) => user.status === "suspended").length;
  const totalCoins = users.reduce((sum, user) => sum + user.balance, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Operations</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Users</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Search beta players, inspect balances, and make audited adjustments
            or suspensions. Suspended accounts lose protected access on their
            next request.
          </p>
        </div>
        <Badge
          variant="outline"
          className="w-fit border-brand/30 bg-brand/10 text-brand"
        >
          {formatCoins(totalCoins)} BET in view
        </Badge>
      </div>

      <form
        method="get"
        className="flex flex-col gap-2 rounded-xl border border-border/80 bg-card/70 p-3 sm:flex-row sm:items-center"
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={search}
            placeholder="Search email or display name"
            className="pl-9"
            autoComplete="off"
          />
        </div>
        <select
          name="status"
          defaultValue={filter}
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {FILTERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm">
          Search
        </Button>
        {search || filter !== "all" ? (
          <Link
            href="/admin/users"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Clear
          </Link>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Showing <strong className="text-foreground">{users.length}</strong>{" "}
          player{users.length === 1 ? "" : "s"}
        </span>
        <span>
          <strong className="text-brand">{active}</strong> active
        </span>
        <span>
          <strong className="text-warning">{suspended}</strong> suspended
        </span>
      </div>

      {users.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/40 px-6 py-16 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-brand/20 bg-brand/10 text-brand">
            <Users className="size-6" />
          </span>
          <p className="mt-4 text-base font-semibold">No players found</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Try a different search term or status filter.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => {
            const status = STATUS_STYLES[user.status];

            return (
              <article
                key={user.id}
                className="rounded-xl border border-border/80 bg-card/70 p-4"
              >
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge className={cn("text-[0.6rem]", status.className)}>
                        {status.label}
                      </Badge>
                      {user.role === "admin" ? (
                        <Badge
                          variant="outline"
                          className="border-brand/30 bg-brand/10 text-[0.6rem] text-brand"
                        >
                          Admin
                        </Badge>
                      ) : null}
                      <span className="font-mono text-[0.62rem] text-muted-foreground">
                        #{user.id.slice(0, 8)}
                      </span>
                    </div>
                    <p className="mt-1.5 truncate text-sm font-medium">
                      {user.displayName}
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        · {user.email}
                      </span>
                    </p>
                    <p className="text-[0.65rem] text-muted-foreground">
                      Joined {formatDateTime(user.createdAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-row-reverse items-start justify-between gap-6 sm:flex-row sm:justify-end">
                    <div className="text-right">
                      <p className="text-[0.58rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        Balance
                      </p>
                      <p className="mt-0.5 text-lg font-semibold tabular-nums text-brand">
                        {formatCoins(user.balance)}
                        <span className="ml-1 text-[0.65rem] font-medium tracking-normal text-muted-foreground">
                          BET
                        </span>
                      </p>
                    </div>
                    <AdminUserActions
                      userId={user.id}
                      displayName={user.displayName}
                      balance={user.balance}
                      status={user.status}
                      isSelf={context.user.id === user.id}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
