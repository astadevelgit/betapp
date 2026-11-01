import type { Metadata } from "next";
import { Users } from "lucide-react";

import { AdminPlaceholder } from "@/components/admin/admin-placeholder";

export const metadata: Metadata = {
  title: "Admin users",
};

export default function AdminUsersPage() {
  return (
    <AdminPlaceholder
      title="Users"
      description="Find beta players, review account status and balances, and make audited balance adjustments or suspensions."
      icon={Users}
      comingSoon={[
        "Search by email or display name",
        "Role, status, and wallet balance",
        "Audited balance adjustments",
        "Suspend and restore access",
      ]}
    />
  );
}
