import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { Search, WalletCards } from "lucide-react";

import { AdminConfigNotice } from "@/components/admin/admin-config-notice";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getAdminTransactions,
  type AdminTransactionFilter,
  type AdminTransactionRow,
  type WalletTxType,
} from "@/lib/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { formatCoins, formatDateTime } from "@/lib/format";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Admin transactions",
};

export const instant = false;

const TX_LABELS: Record<WalletTxType, string> = {
  signup_bonus: "Signup bonus",
  daily_claim: "Daily claim",
  bet_stake: "Bet stake",
  bet_payout: "Bet payout",
  bet_refund: "Bet refund",
  admin_adjustment: "Admin adjustment",
  correction: "Correction",
};

const TX_FILTERS: Array<{ value: AdminTransactionFilter; label: string }> = [
  { value: "all", label: "All types" },
  ...Object.entries(TX_LABELS).map(([value, label]) => ({
    value: value as AdminTransactionFilter,
    label,
  })),
];

function resolveType(value: string | undefined): AdminTransactionFilter {
  return value && value in TX_LABELS
    ? (value as AdminTransactionFilter)
    : "all";
}

function readString(value: string | undefined): string {
  return typeof value === "string" ? value : "";
}

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    q?: string;
    from?: string;
    to?: string;
  }>;
}) {
  await connection();
  await requireAdmin();

  if (!isSupabaseAdminConfigured()) {
    return <AdminConfigNotice />;
  }

  const params = await searchParams;
  const type = resolveType(params.type);
  const search = readString(params.q);
  const from = readString(params.from);
  const to = readString(params.to);
  const transactions = await getAdminTransactions({
    type,
    search,
    from,
    to,
  });

  const credits = transactions.reduce(
    (sum, transaction) =>
      transaction.amount > 0 ? sum + transaction.amount : sum,
    0,
  );
  const debits = transactions.reduce(
    (sum, transaction) =>
      transaction.amount < 0 ? sum + transaction.amount : sum,
    0,
  );
  const filtered = type !== "all" || search || from || to;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Operations</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Transactions
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            The immutable coin ledger: signup grants, daily claims, stakes,
            payouts, refunds, and audited admin corrections.
          </p>
        </div>
        <Badge
          variant="outline"
          className="w-fit border-brand/30 bg-brand/10 text-brand"
        >
          {transactions.length} row{transactions.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <form
        method="get"
        className="grid gap-2 rounded-xl border border-border/80 bg-card/70 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_11rem_9rem_9rem_auto]"
      >
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={search}
            placeholder="Search player email or name"
            className="pl-9"
            autoComplete="off"
          />
        </div>
        <select
          name="type"
          defaultValue={type}
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {TX_FILTERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <Input
          type="date"
          name="from"
          defaultValue={from}
          aria-label="From date"
        />
        <Input
          type="date"
          name="to"
          defaultValue={to}
          aria-label="To date"
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm">
            Filter
          </Button>
          {filtered ? (
            <Link
              href="/admin/transactions"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span>
          Credits{" "}
          <strong className="text-brand">+{formatCoins(credits)}</strong> BET
        </span>
        <span>
          Debits{" "}
          <strong className="text-destructive">{formatCoins(debits)}</strong> BET
        </span>
        <span>Visible net: {formatCoins(credits + debits)} BET</span>
      </div>

      {transactions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-card/40 px-6 py-16 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-brand/20 bg-brand/10 text-brand">
            <WalletCards className="size-6" />
          </span>
          <p className="mt-4 text-base font-semibold">No ledger rows</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {filtered
              ? "No transactions match these filters."
              : "Ledger entries appear here after the first signup grant."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map((transaction) => (
            <LedgerRow key={transaction.id} transaction={transaction} />
          ))}
        </div>
      )}
    </div>
  );
}

function LedgerRow({
  transaction,
}: {
  transaction: AdminTransactionRow;
}) {
  const credit = transaction.amount > 0;
  const reason =
    typeof transaction.metadata.reason === "string"
      ? transaction.metadata.reason
      : null;
  const reference =
    transaction.reference.startsWith("bet:")
      ? `#${transaction.reference.slice(4, 12)}`
      : transaction.reference.replaceAll("_", " ");

  return (
    <article className="rounded-xl border border-border/80 bg-card/70 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[0.6rem]">
              {TX_LABELS[transaction.type]}
            </Badge>
            <span className="font-mono text-[0.62rem] text-muted-foreground">
              #{transaction.id.slice(0, 8)}
            </span>
            <span className="text-[0.62rem] text-muted-foreground">
              · {reference}
            </span>
          </div>
          <p className="mt-1.5 truncate text-sm font-medium">
            {transaction.user.displayName}
            <span className="ml-1.5 font-normal text-muted-foreground">
              · {transaction.user.email}
            </span>
          </p>
          <p className="text-[0.65rem] text-muted-foreground">
            {formatDateTime(transaction.createdAt)}
          </p>
          {reason ? (
            <p className="mt-1 max-w-xl text-[0.68rem] text-muted-foreground">
              <span className="font-medium text-foreground">Reason:</span>{" "}
              {reason}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 text-right">
          <p
            className={cn(
              "text-base font-semibold tabular-nums",
              credit ? "text-brand" : "text-destructive",
            )}
          >
            {credit ? "+" : ""}
            {formatCoins(transaction.amount)}
            <span className="ml-1 text-[0.62rem] font-medium tracking-normal text-muted-foreground">
              BET
            </span>
          </p>
          <p className="text-[0.62rem] tabular-nums text-muted-foreground">
            {formatCoins(transaction.balanceBefore)} →{" "}
            <span className="text-foreground">
              {formatCoins(transaction.balanceAfter)}
            </span>
          </p>
        </div>
      </div>
    </article>
  );
}
