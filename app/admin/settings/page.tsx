import type { Metadata } from "next";
import { Settings } from "lucide-react";

import { AdminPlaceholder } from "@/components/admin/admin-placeholder";

export const metadata: Metadata = {
  title: "Admin settings",
};

export default function AdminSettingsPage() {
  return (
    <AdminPlaceholder
      title="Settings"
      description="Control the closed-loop economy and beta gate without SQL: grants, limits, payout caps, and maintenance mode."
      icon={Settings}
      comingSoon={[
        "Signup bonus and daily claim amounts",
        "Stake and payout limits",
        "Beta cap and waitlist toggle",
        "Maintenance mode",
      ]}
    />
  );
}
