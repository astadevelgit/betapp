export type ActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
};

export const initialActionState: ActionState = {
  status: "idle",
};
