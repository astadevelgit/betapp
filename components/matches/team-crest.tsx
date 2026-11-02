import Image from "next/image";

import { cn } from "@/lib/utils";

export function TeamCrest({
  name,
  logoUrl,
  size = 24,
  className,
}: {
  name: string;
  logoUrl: string | null;
  size?: number;
  className?: string;
}) {
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        className={cn("shrink-0 object-contain", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full border border-border/70 bg-muted/50 font-semibold uppercase text-muted-foreground",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.28) }}
    >
      {initials(name)}
    </span>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
