import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { demoUser } from "@/lib/demo-data";
import { getEnv, isDemoMode, isSupabaseConfigured, requireEnv } from "@/lib/env";

export async function createSupabaseServerClient() {
  if (!getEnv("NEXT_PUBLIC_SUPABASE_URL") || !getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: Parameters<typeof cookieStore.set>[2] }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server components cannot set cookies. Route handlers can.
          }
        }
      }
    }
  );
}

let adminClient: SupabaseClient | null = null;

export function createSupabaseAdminClient() {
  if (!isSupabaseConfigured()) return null;
  if (!adminClient) {
    adminClient = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return adminClient;
}

export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  if ((!supabase || !isSupabaseConfigured()) && isDemoMode()) {
    return demoUser;
  }

  if (!supabase || !isSupabaseConfigured()) return null;

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user?.email) return null;

  return {
    id: user.id,
    email: user.email
  };
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}
