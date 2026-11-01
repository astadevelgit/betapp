import { AlertCircle, CheckCircle2 } from "lucide-react";

import type { ActionState } from "@/lib/action-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export function FormMessage({ state }: { state: ActionState }) {
  if (!state.message) {
    return null;
  }

  const isError = state.status === "error";

  return (
    <Alert
      variant={isError ? "destructive" : "default"}
      className={cn(
        isError
          ? "border-destructive/30 bg-destructive/10"
          : "border-brand/30 bg-brand/10 text-brand",
      )}
    >
      {isError ? (
        <AlertCircle className="size-4" />
      ) : (
        <CheckCircle2 className="size-4" />
      )}
      <AlertDescription className={cn(!isError && "text-brand/90")}>
        {state.message}
      </AlertDescription>
    </Alert>
  );
}

export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) {
    return null;
  }

  return (
    <p className="text-xs text-destructive" role="alert">
      {messages[0]}
    </p>
  );
}
