import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { AdminPlaceholder } from "@/components/admin/admin-placeholder";

export const metadata: Metadata = {
  title: "Admin matches",
};

export default function AdminMatchesPage() {
  return (
    <AdminPlaceholder
      title="Matches"
      description="Inspect fixtures, sync state, kickoff times, scores, and market coverage. Suspend or refresh a match when the provider feed drifts."
      icon={ShieldCheck}
      comingSoon={[
        "Fixture sync status and last refresh",
        "Kickoff, score, and live minute",
        "Market and selection coverage",
        "Manual refresh and suspend controls",
      ]}
    />
  );
}
