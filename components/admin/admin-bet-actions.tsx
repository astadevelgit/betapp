"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { resolveAdminBetAction } from "@/lib/admin/actions";
import { formatCoins } from "@/lib/format";

type Mode = "settle" | "void";

export function AdminBetActions({
  betId,
  canSettle,
  settleReason,
  stake,
}: {
  betId: string;
  canSettle: boolean;
  settleReason: string | null;
  stake: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function open(nextMode: Mode) {
    setReason("");
    setMode(nextMode);
  }

  function close() {
    if (!pending) setMode(null);
  }

  function submit() {
    if (!mode || reason.trim().length < 3 || pending) return;

    startTransition(async () => {
      const result = await resolveAdminBetAction({
        betId,
        mode,
        reason,
      });

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setMode(null);
      setReason("");
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={!canSettle}
          title={canSettle ? "Settle from the provider result" : (settleReason ?? undefined)}
          onClick={() => open("settle")}
        >
          <CheckCircle2 className="size-3.5" />
          Settle
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => open("void")}
        >
          <TriangleAlert className="size-3.5" />
          Void
        </Button>
      </div>

      <Dialog
        open={mode !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) close();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mode === "void" ? "Void this bet?" : "Settle this bet?"}
            </DialogTitle>
            <DialogDescription>
              {mode === "void"
                ? "Every leg is voided and the full stake is refunded to the player. The player keeps the leg history."
                : "The result is computed from the final scores and applied once. This cannot be edited after settlement."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {mode === "void" ? (
              <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs leading-5 text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <p>
                  Refund: <strong>{formatCoins(stake)} BET</strong> will be
                  credited. Use this for a postponed, abandoned, or invalid
                  fixture, or a verified data issue.
                </p>
              </div>
            ) : !canSettle ? (
              <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs leading-5 text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <p>{settleReason ?? "This bet is not ready to settle."}</p>
              </div>
            ) : (
              <p className="rounded-lg border border-border/70 bg-background/40 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
                All legs have a final result. The payout is recalculated from
                the odds snapshots, excluding any void legs.
              </p>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor={`settlement-reason-${betId}`}
                className="text-xs font-medium text-muted-foreground"
              >
                Reason
              </label>
              <Input
                id={`settlement-reason-${betId}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={300}
                placeholder="e.g. Final score verified against provider"
                autoComplete="off"
              />
              <p className="text-[0.65rem] text-muted-foreground">
                Saved to the audit log with your admin account. At least 3
                characters.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={mode === "void" ? "destructive" : "default"}
              onClick={submit}
              disabled={
                pending ||
                reason.trim().length < 3 ||
                (mode === "settle" && !canSettle)
              }
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Applying…
                </>
              ) : mode === "void" ? (
                "Void and refund"
              ) : (
                "Settle bet"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
