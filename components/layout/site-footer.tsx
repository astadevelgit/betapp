import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/70 py-10">
      <div className="page-shell flex flex-col gap-6 text-sm text-muted-foreground md:flex-row md:items-start md:justify-between">
        <div className="max-w-md space-y-2">
          <p className="font-semibold text-foreground">BetApp</p>
          <p>
            A private, play-money football prediction game. BET coins have no
            cash value and cannot be purchased, withdrawn, or exchanged for
            prizes.
          </p>
        </div>

        <div className="flex flex-col gap-3 md:items-end">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
            <ShieldCheck className="size-3.5" />
            18+ · Nigeria
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/legal#terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/legal#privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/legal#responsible-play" className="hover:text-foreground">
              Responsible play
            </Link>
            <Link href="/legal#credits" className="hover:text-foreground">
              Asset credits
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
