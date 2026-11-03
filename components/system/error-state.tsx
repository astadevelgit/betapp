"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Home, RotateCcw, TriangleAlert } from "lucide-react";
import * as Sentry from "@sentry/nextjs";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function errorDetail(error: unknown): string | null {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return error instanceof Error && error.message ? error.message : null;
}

function errorDigest(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return null;
  }

  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest ? digest : null;
}

export function ErrorState({
  error,
  retry,
  scope,
  title = "Something went wrong.",
  description = "The page could not load. Your wallet and bets are safe. Try again, or head back to the lobby.",
  className,
}: {
  error: unknown;
  retry: () => void;
  scope: string;
  title?: string;
  description?: string;
  className?: string;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: scope },
    });
  }, [error, scope]);

  const digest = errorDigest(error);
  const detail = errorDetail(error);

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-xl flex-col items-center rounded-2xl border border-border/70 bg-card/70 px-6 py-10 text-center shadow-xl shadow-black/10",
        className,
      )}
    >
      <span className="grid size-14 place-items-center rounded-2xl border border-destructive/30 bg-destructive/10 text-destructive">
        <TriangleAlert className="size-6" />
      </span>
      <p className="eyebrow mt-6">Unexpected error</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>

      {detail ? (
        <p className="mt-4 max-w-md break-words rounded-lg border border-border/70 bg-background/60 px-3 py-2 font-mono text-xs text-muted-foreground">
          {detail}
        </p>
      ) : null}

      {digest ? (
        <p className="mt-3 font-mono text-[0.68rem] text-muted-foreground/70">
          Reference: {digest}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button type="button" size="lg" className="h-10" onClick={() => retry()}>
          <RotateCcw className="size-4" />
          Try again
        </Button>
        <Link
          href="/"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10")}
        >
          <Home className="size-4" />
          Back to lobby
        </Link>
      </div>
    </div>
  );
}
