export type ProfileRole = "user" | "admin";
export type ProfileStatus = "active" | "suspended" | "deleted";

/** Shape returned by Supabase/PostgREST for public.profiles. */
export type ProfileRow = {
  id: string;
  email: string;
  display_name: string;
  dob: string;
  country: string;
  role: ProfileRole;
  status: ProfileStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
