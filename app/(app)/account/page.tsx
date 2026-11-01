import type { Metadata } from "next";
import { CalendarDays, Globe2, LogOut, Mail, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { signOutAction } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";
import { formatDateOnly, formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Account",
};

export const instant = false;

export default async function AccountPage() {
  const { profile } = await requireUser();

  const rows = [
    {
      icon: UserRound,
      label: "Display name",
      value: profile.display_name,
    },
    {
      icon: Mail,
      label: "Email",
      value: profile.email,
    },
    {
      icon: CalendarDays,
      label: "Date of birth",
      value: formatDateOnly(profile.dob),
    },
    {
      icon: Globe2,
      label: "Country",
      value: profile.country === "NG" ? "Nigeria" : profile.country,
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="eyebrow">Your profile</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Member since {formatDateTime(profile.created_at)}.
        </p>
      </div>

      <Card className="border-border/80 bg-card/70">
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
          <CardDescription>
            Profile editing and account deletion arrive in a later build.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border/70">
            {rows.map((row) => {
              const Icon = row.icon;
              return (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
                >
                  <dt className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <Icon className="size-4" />
                    {row.label}
                  </dt>
                  <dd className="text-right text-sm font-medium">{row.value}</dd>
                </div>
              );
            })}
          </dl>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/70">
        <CardHeader>
          <CardTitle>Session</CardTitle>
          <CardDescription>
            Sign out of this device. You can log back in at any time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signOutAction}>
            <Button type="submit" variant="outline" className="h-11">
              <LogOut className="size-4" />
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
