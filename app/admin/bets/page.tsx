import type { Metadata } from "next";
import { Ticket } from "lucide-react";

import { AdminPlaceholder } from "@/components/admin/admin-placeholder";

export const metadata: Metadata = {
  title: "Admin bets",
};

export default function AdminBetsPage() {
  return (
    <AdminPlaceholder
      title="Bets"
      description="Search open and settled bets, inspect legs and odds snapshots, and apply audited manual settlement or void decisions."
      icon={Ticket}
      comingSoon={[
        "Filter by status, user, or match",
        "Leg-level result inspection",
        "Manual settle and void with reason",
        "Audit trail for every override",
      ]}
    />
  );
}
