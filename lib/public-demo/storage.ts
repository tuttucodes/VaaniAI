import { toAgentInsert } from "@/lib/agent-config";
import { demoScenarios, getDemoScenario, type DemoScenarioId } from "@/lib/public-demo/scenarios";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

async function findAuthUserByEmail(email: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 100) break;
  }

  return null;
}

export async function ensurePublicDemoUser() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Calling is not fully configured yet.");

  const email = process.env.PUBLIC_DEMO_USER_EMAIL || process.env.SEED_USER_EMAIL || "demo@vaani.local";
  const password = process.env.PUBLIC_DEMO_USER_PASSWORD || process.env.SEED_USER_PASSWORD || "VaaniDemo123!";
  const existing = await findAuthUserByEmail(email);
  const user =
    existing ||
    (
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { seeded_by: "vaani-public-demo" }
      })
    ).data.user;

  if (!user?.id) throw new Error("Could not create public demo user.");
  await supabase.from("users").upsert({ id: user.id, email });
  return { id: user.id, email };
}

export async function ensurePublicDemoAgents() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Calling is not fully configured yet.");

  const user = await ensurePublicDemoUser();
  const agents = [];

  for (const scenario of demoScenarios) {
    const insert = toAgentInsert(
      {
        name: scenario.agentName,
        description: scenario.subtitle,
        system_prompt: scenario.systemPrompt,
        first_message: scenario.firstPrompt,
        language: "en-IN",
        voice_id: "vobiz-woman-en-us",
        temperature: 0.35,
        max_call_duration_seconds: 240,
        silence_timeout_ms: 900,
        interruption_enabled: true,
        vobiz_phone_number: process.env.VOBIZ_PHONE_NUMBER || process.env.DEFAULT_FROM_NUMBER || "",
        vobiz_sip_config: process.env.VOBIZ_SIP_DOMAIN || "",
        cost_mode: "economy",
        latency_mode: "ultra-low",
        knowledge_retrieval_enabled: true,
        human_fillers_enabled: true,
        end_call_rules: "End after two to three demo turns, callback capture, opt-out, or goodbye."
      },
      user.id
    );

    const { data, error } = await supabase.from("agents").upsert(insert, { onConflict: "user_id,name" }).select("*").single();
    if (error) throw error;
    agents.push({ scenarioId: scenario.id, agent: data });
  }

  return { user, agents };
}

export async function getPublicDemoAgent(scenarioId: DemoScenarioId) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Calling is not fully configured yet.");

  const scenario = getDemoScenario(scenarioId);
  const { user } = await ensurePublicDemoAgents();
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("user_id", user.id)
    .eq("name", scenario.agentName)
    .single();
  if (error) throw error;

  return { user, agent: data, scenario };
}
