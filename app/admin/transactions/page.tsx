import type { Metadata } from "next";
import { WalletCards } from "lucide-react";

import { AdminPlaceholder } from "@/components/admin/admin-placeholder";

export const metadata: Metadata = {
  title: "Admin transactions",
};

export default function AdminTransactionsPage() {
  return (
    <AdminPlaceholder
      title="Transactions"
      description="Read the immutable coin ledger across signup bonuses, daily claims, stakes, payouts, refunds, and admin corrections."
      icon={WalletCards}
      comingSoon={[
        "Filter by type, user, or date",
        "Balance before and after",
        "Idempotency references",
        "Export for reconciliation",
      ]}
    />
  );
}
