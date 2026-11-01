import "server-only";

import { cache } from "react";
import { notFound, redirect } from "next/navigation";

import type { ProfileRow } from "@/lib/auth/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthContext = {
  user: {
    id: string;
    email: string | null;
  };
  profile: ProfileRow;
};

export const getCurrentUser = cache(async (): Promise<AuthContext | null> => {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const profile = data as ProfileRow;

  if (profile.status !== "active" || profile.deleted_at) {
    return null;
  }

  return {
    user: {
      id: user.id,
      email: user.email ?? profile.email,
    },
    profile,
  };
});

export async function requireUser(): Promise<AuthContext> {
  const context = await getCurrentUser();

  if (!context) {
    redirect("/auth/login");
  }

  return context;
}

export async function requireAdmin(): Promise<AuthContext> {
  const context = await requireUser();

  if (context.profile.role !== "admin") {
    notFound();
  }

  return context;
}
