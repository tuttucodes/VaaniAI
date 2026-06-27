import { toAgentInsert } from "@/lib/agent-config";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

async function findUserIdByEmail(supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, email: string) {
  const pageSize = 100;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: pageSize });
    if (error) throw error;

    const existing = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (existing) return existing.id;
    if (data.users.length < pageSize) break;
  }

  return null;
}

async function getOrCreateSeedUser(supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>) {
  const email = process.env.SEED_USER_EMAIL || "demo@vaani.local";
  const password = process.env.SEED_USER_PASSWORD || "VaaniDemo123!";
  const existingUserId = await findUserIdByEmail(supabase, email);
  if (existingUserId) return { id: existingUserId, email };

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      seeded_by: "vaani-ai-voice"
    }
  });

  if (error) throw error;
  if (!data.user?.id) throw new Error("Supabase did not return a seed user id.");

  return { id: data.user.id, email };
}

async function main() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.log("Supabase is not configured. The app will use built-in demo data.");
    return;
  }

  const user = await getOrCreateSeedUser(supabase);
  await supabase.from("users").upsert({ id: user.id, email: user.email });

  const insert = toAgentInsert(
    {
      name: "Sales Demo Agent",
      description: "Friendly qualification and follow-up booking assistant.",
      system_prompt:
        "You are a friendly, human-like sales assistant. You answer questions clearly, qualify the lead, explain the product, and try to book a follow-up. Keep responses short, natural, and conversational. Ask one question at a time.",
      first_message: "Hi, this is Vaani. I can help answer questions and book a quick follow-up.",
      language: "en-IN",
      voice_id: "gemini-natural-female",
      temperature: 0.4,
      max_call_duration_seconds: 600,
      silence_timeout_ms: 900,
      interruption_enabled: true,
      vobiz_phone_number: process.env.DEFAULT_FROM_NUMBER || "",
      vobiz_sip_config: "TODO: configure Vobiz SIP trunk details",
      cost_mode: "economy",
      latency_mode: "ultra-low",
      knowledge_retrieval_enabled: true,
      human_fillers_enabled: true,
      end_call_rules: "End after booking, explicit goodbye, opt-out, or abusive call."
    },
    user.id
  );

  const { data, error } = await supabase
    .from("agents")
    .upsert(insert, { onConflict: "user_id,name" })
    .select("*")
    .single();
  if (error) throw error;
  console.log(`Seeded demo user: ${user.email}`);
  console.log(`Seeded demo agent: ${data.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
