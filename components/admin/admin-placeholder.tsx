import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function AdminPlaceholder({
  title,
  description,
  icon: Icon,
  comingSoon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  comingSoon: string[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Admin console</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>

      <Card className="border-border/80 bg-card/70">
        <CardContent className="flex flex-col items-center px-6 py-14 text-center">
          <span className="grid size-14 place-items-center rounded-2xl border border-brand/20 bg-brand/10 text-brand">
            <Icon className="size-6" />
          </span>
          <h2 className="mt-5 text-xl font-semibold">Screen scheduled</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            The foundation is in place. This operational screen is scheduled for
            the settlement and admin build.
          </p>
          <ul className="mt-6 grid gap-2 text-left text-sm text-muted-foreground sm:grid-cols-2">
            {comingSoon.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
