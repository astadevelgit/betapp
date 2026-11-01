import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const displayName = process.env.ADMIN_DISPLAY_NAME?.trim() || "BetApp Admin";
const dob = process.env.ADMIN_DOB || "1990-01-01";

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.",
  );
  process.exit(1);
}

if (!email || !password) {
  console.error("Missing ADMIN_EMAIL or ADMIN_PASSWORD in .env.local.");
  process.exit(1);
}

if (password.length < 8) {
  console.error("ADMIN_PASSWORD must be at least 8 characters.");
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

const { data: users, error: listError } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});

if (listError) {
  console.error("Could not list users:", listError.message);
  process.exit(1);
}

const existing = users.users.find(
  (user) => user.email?.toLowerCase() === email,
);

let userId = existing?.id;

if (userId) {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
      dob,
      country: "NG",
    },
  });

  if (error) {
    console.error("Could not update admin auth user:", error.message);
    process.exit(1);
  }

  console.log(`Updated existing auth user ${email}.`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
      dob,
      country: "NG",
    },
  });

  if (error || !data.user) {
    console.error("Could not create admin auth user:", error?.message);
    process.exit(1);
  }

  userId = data.user.id;
  console.log(`Created auth user ${email}.`);
}

const { error: profileError } = await admin
  .from("profiles")
  .update({ role: "admin", status: "active" })
  .eq("id", userId);

if (profileError) {
  console.error("Could not promote profile to admin:", profileError.message);
  process.exit(1);
}

const { data: wallet, error: walletError } = await admin
  .from("wallets")
  .select("user_id")
  .eq("user_id", userId)
  .maybeSingle();

if (walletError) {
  console.error("Could not check admin wallet:", walletError.message);
  process.exit(1);
}

if (!wallet) {
  const { error: insertError } = await admin
    .from("wallets")
    .insert({ user_id: userId });

  if (insertError) {
    console.error("Could not create admin wallet:", insertError.message);
    process.exit(1);
  }
}

console.log(`Admin ready: ${email} (${userId})`);
