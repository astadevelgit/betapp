import type { Metadata } from "next";
import { ScrollText } from "lucide-react";

import { AdminPlaceholder } from "@/components/admin/admin-placeholder";

export const metadata: Metadata = {
  title: "Admin audit log",
};

export default function AdminAuditPage() {
  return (
    <AdminPlaceholder
      title="Audit log"
      description="Every manual admin action should be explainable. This screen records before/after values and the reason for the change."
      icon={ScrollText}
      comingSoon={[
        "Admin, action, and entity filters",
        "Before and after snapshots",
        "Required reason for overrides",
        "Timestamped history",
      ]}
    />
  );
}
