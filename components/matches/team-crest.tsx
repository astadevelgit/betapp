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
    const imageSize = Math.max(16, Math.round(size * 0.82));

    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden rounded-full bg-white/95 ring-1 ring-black/10",
          className,
        )}
        style={{ width: size, height: size }}
      >
        <Image
          src={logoUrl}
          alt=""
          width={imageSize}
          height={imageSize}
          className="object-contain"
          style={{ width: imageSize, height: imageSize }}
        />
      </span>
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
