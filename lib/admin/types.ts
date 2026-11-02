export interface AdminBetActionInput {
  betId: string;
  mode: "settle" | "void";
  reason: string;
}

export type AdminBetActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };
