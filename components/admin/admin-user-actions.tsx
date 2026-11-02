"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CircleDollarSign,
  Loader2,
  ShieldCheck,
  ShieldOff,
  TriangleAlert,
} from "lucide-react";
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
import {
  adjustUserBalanceAction,
  setUserStatusAction,
} from "@/lib/admin/actions";
import { formatCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

type Mode = "balance" | "status";

export function AdminUserActions({
  userId,
  displayName,
  balance,
  status,
  isSelf,
}: {
  userId: string;
  displayName: string;
  balance: number;
  status: "active" | "suspended" | "deleted";
  isSelf: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const [pending, startTransition] = useTransition();

  const parsedAmount = Number(amount);
  const amountValid =
    amount.trim() !== "" &&
    Number.isInteger(parsedAmount) &&
    parsedAmount !== 0 &&
    Math.abs(parsedAmount) <= 1_000_000;
  const projectedBalance = amountValid ? balance + parsedAmount : balance;
  const nextStatus = status === "active" ? "suspended" : "active";

  function open(nextMode: Mode) {
    setAmount("");
    setReason("");
    setRequestKey(crypto.randomUUID());
    setMode(nextMode);
  }

  function close() {
    if (!pending) setMode(null);
  }

  function submit() {
    if (!mode || pending || reason.trim().length < 3) return;

    startTransition(async () => {
      const result =
        mode === "balance"
          ? await adjustUserBalanceAction({
              userId,
              amount: parsedAmount,
              reason,
              idempotencyKey: requestKey || crypto.randomUUID(),
            })
          : await setUserStatusAction({
              userId,
              status: nextStatus,
              reason,
            });

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(result.message);
      setMode(null);
      setReason("");
      setAmount("");
      router.refresh();
    });
  }

  if (status === "deleted") {
    return null;
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => open("balance")}
        >
          <CircleDollarSign className="size-3.5" />
          Adjust
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className={cn(
            status === "active" && "text-destructive hover:text-destructive",
          )}
          disabled={isSelf}
          title={
            isSelf
              ? "You cannot suspend your own admin account."
              : undefined
          }
          onClick={() => open("status")}
        >
          {status === "active" ? (
            <ShieldOff className="size-3.5" />
          ) : (
            <ShieldCheck className="size-3.5" />
          )}
          {status === "active" ? "Suspend" : "Restore"}
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
              {mode === "balance"
                ? `Adjust ${displayName}'s balance`
                : status === "active"
                  ? `Suspend ${displayName}?`
                  : `Restore ${displayName}?`}
            </DialogTitle>
            <DialogDescription>
              {mode === "balance"
                ? "The adjustment is written to the immutable ledger and the audit log. It cannot take the wallet below zero."
                : status === "active"
                  ? "A suspended player cannot open the app or place bets until an admin restores the account."
                  : "Restoring the account makes the player active again. Existing bets and ledger history are untouched."}
            </DialogDescription>
          </DialogHeader>

          {mode === "balance" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor={`adjust-amount-${userId}`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Amount (BET coins)
                </label>
                <Input
                  id={`adjust-amount-${userId}`}
                  type="number"
                  step="1"
                  min={-1_000_000}
                  max={1_000_000}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="e.g. 5000 or -1000"
                  autoComplete="off"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[1000, 5000, -1000].map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => setAmount(String(value))}
                    >
                      {value > 0 ? "+" : ""}
                      {formatCoins(value)}
                    </Button>
                  ))}
                </div>
              </div>

              <p className="rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                Current balance:{" "}
                <strong className="text-foreground">
                  {formatCoins(balance)} BET
                </strong>
                {amountValid ? (
                  <>
                    {" "}
                    · After:{" "}
                    <strong
                      className={cn(
                        projectedBalance < 0
                          ? "text-destructive"
                          : "text-brand",
                      )}
                    >
                      {formatCoins(projectedBalance)} BET
                    </strong>
                  </>
                ) : null}
              </p>

              {amountValid && projectedBalance < 0 ? (
                <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  This adjustment would take the wallet below zero.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs leading-5 text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {status === "active"
                ? "The player is signed out of protected pages on their next request."
                : "The player will be able to sign in and bet again."}
            </p>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor={`reason-${mode}-${userId}`}
              className="text-xs font-medium text-muted-foreground"
            >
              Reason
            </label>
            <Input
              id={`reason-${mode}-${userId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={300}
              placeholder={
                mode === "balance"
                  ? "e.g. Compensation for a verified data error"
                  : "e.g. Confirmed multi-account abuse"
              }
              autoComplete="off"
            />
            <p className="text-[0.65rem] text-muted-foreground">
              Saved to the audit log with your admin account. At least 3
              characters.
            </p>
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
              variant={
                mode === "status" && status === "active"
                  ? "destructive"
                  : "default"
              }
              onClick={submit}
              disabled={
                pending ||
                reason.trim().length < 3 ||
                (mode === "balance" &&
                  (!amountValid || projectedBalance < 0))
              }
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Applying…
                </>
              ) : mode === "balance" ? (
                "Apply adjustment"
              ) : status === "active" ? (
                "Suspend player"
              ) : (
                "Restore player"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
