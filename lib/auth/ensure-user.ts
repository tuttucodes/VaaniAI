import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function ensureUserRecord(user: { id: string; email: string }) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;

  const { error } = await supabase.from("users").upsert({
    id: user.id,
    email: user.email
  });

  if (error) throw error;
}
