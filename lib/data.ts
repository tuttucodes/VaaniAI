import {
  demoAgent,
  demoAgents,
  demoCalls,
  demoInsight,
  demoKnowledgeFiles,
  demoLeads,
  demoLearningEvents,
  demoMemory,
  demoMessages,
  demoMetrics,
  demoUnansweredQuestions
} from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type {
  Agent,
  AgentKnowledgeFile,
  AgentLearningEvent,
  AgentMemory,
  Call,
  CallInsight,
  CallMessage,
  CallMetric,
  ExtractedLead,
  UnansweredQuestion
} from "@/lib/types";

function admin() {
  return createSupabaseAdminClient();
}

function demoOrThrow<T>(value: T): T {
  if (isDemoMode()) return value;
  throw new Error("Supabase is not configured. Set Supabase env vars or enable VAANI_DEMO_MODE for local demos.");
}

export async function listAgents(userId: string): Promise<Agent[]> {
  const supabase = admin();
  if (!supabase) return demoOrThrow(demoAgents);

  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as Agent[];
}

export async function getAgent(userId: string, id: string): Promise<Agent | null> {
  const supabase = admin();
  if (!supabase) return demoOrThrow(demoAgents.find((agent) => agent.id === id) || demoAgent);

  const { data, error } = await supabase.from("agents").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Agent | null;
}

export async function listKnowledgeFiles(userId: string, agentId?: string): Promise<AgentKnowledgeFile[]> {
  const supabase = admin();
  if (!supabase) return demoOrThrow(agentId ? demoKnowledgeFiles.filter((file) => file.agent_id === agentId) : demoKnowledgeFiles);

  let query = supabase
    .from("agent_knowledge_files")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (agentId) query = query.eq("agent_id", agentId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as AgentKnowledgeFile[];
}

export async function listCalls(userId: string, agentId?: string): Promise<Call[]> {
  const supabase = admin();
  if (!supabase) return demoOrThrow(agentId ? demoCalls.filter((call) => call.agent_id === agentId) : demoCalls);

  let query = supabase
    .from("calls")
    .select("*, agents(name, voice_id)")
    .eq("user_id", userId)
    .order("started_at", { ascending: false, nullsFirst: false });

  if (agentId) query = query.eq("agent_id", agentId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Call[];
}

export async function searchCalls(userId: string, search: string): Promise<Call[]> {
  const q = search.trim();
  if (!q) return listCalls(userId);

  const supabase = admin();
  if (!supabase) {
    return demoOrThrow(
      demoCalls.filter((call) => {
        const relatedMessages = demoMessages.filter((message) => message.call_id === call.id);
        const relatedLeads = demoLeads.filter((lead) => lead.call_id === call.id);
        const haystack = [
          call.phone_number,
          call.status,
          call.summary,
          call.agents?.name,
          ...relatedMessages.map((message) => message.content),
          ...relatedLeads.flatMap((lead) => [lead.name, lead.phone, lead.email, lead.company, lead.requirement, lead.status])
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q.toLowerCase());
      })
    );
  }

  const pattern = `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const [callMatches, messageMatches, insightMatches, leadMatches] = await Promise.all([
    supabase
      .from("calls")
      .select("id")
      .eq("user_id", userId)
      .or(`phone_number.ilike.${pattern},status.ilike.${pattern},summary.ilike.${pattern}`),
    supabase
      .from("call_messages")
      .select("call_id, calls!inner(user_id)")
      .eq("calls.user_id", userId)
      .ilike("content", pattern),
    supabase
      .from("call_insights")
      .select("call_id, calls!inner(user_id)")
      .eq("calls.user_id", userId)
      .or(`intent.ilike.${pattern},sentiment.ilike.${pattern},outcome.ilike.${pattern}`),
    supabase
      .from("extracted_leads")
      .select("call_id, calls!inner(user_id)")
      .eq("calls.user_id", userId)
      .or(`name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern},company.ilike.${pattern},requirement.ilike.${pattern},status.ilike.${pattern}`)
  ]);

  for (const result of [callMatches, messageMatches, insightMatches, leadMatches]) {
    if (result.error) throw result.error;
  }

  const ids = new Set<string>();
  for (const row of callMatches.data || []) ids.add(row.id);
  for (const row of messageMatches.data || []) ids.add(row.call_id);
  for (const row of insightMatches.data || []) ids.add(row.call_id);
  for (const row of leadMatches.data || []) ids.add(row.call_id);

  if (!ids.size) return [];

  const { data, error } = await supabase
    .from("calls")
    .select("*, agents(name, voice_id)")
    .eq("user_id", userId)
    .in("id", [...ids])
    .order("started_at", { ascending: false, nullsFirst: false });

  if (error) throw error;
  return (data || []) as Call[];
}

export async function getCall(userId: string, callId: string): Promise<Call | null> {
  const supabase = admin();
  if (!supabase) return demoOrThrow(demoCalls.find((call) => call.id === callId) || demoCalls[0] || null);

  const { data, error } = await supabase
    .from("calls")
    .select("*, agents(name, voice_id)")
    .eq("user_id", userId)
    .eq("id", callId)
    .maybeSingle();

  if (error) throw error;
  return data as Call | null;
}

export async function listCallMessages(userId: string, callId: string): Promise<CallMessage[]> {
  const supabase = admin();
  if (!supabase) return demoOrThrow(demoMessages.filter((message) => message.call_id === callId));

  const call = await getCall(userId, callId);
  if (!call) return [];

  const { data, error } = await supabase
    .from("call_messages")
    .select("*")
    .eq("call_id", callId)
    .order("timestamp", { ascending: true });

  if (error) throw error;
  return (data || []) as CallMessage[];
}

export async function getCallMetrics(userId: string, callId: string): Promise<CallMetric | null> {
  const supabase = admin();
  if (!supabase) return demoOrThrow(demoMetrics.call_id === callId ? demoMetrics : demoMetrics);

  const call = await getCall(userId, callId);
  if (!call) return null;

  const { data, error } = await supabase
    .from("call_metrics")
    .select("*")
    .eq("call_id", callId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as CallMetric | null;
}

export async function getCallInsights(userId: string, callId: string): Promise<CallInsight | null> {
  const supabase = admin();
  if (!supabase) return demoOrThrow(demoInsight.call_id === callId ? demoInsight : demoInsight);

  const call = await getCall(userId, callId);
  if (!call) return null;

  const { data, error } = await supabase.from("call_insights").select("*").eq("call_id", callId).maybeSingle();
  if (error) throw error;
  return data as CallInsight | null;
}

export async function listLearningEvents(userId: string): Promise<AgentLearningEvent[]> {
  const supabase = admin();
  if (!supabase) return demoOrThrow(demoLearningEvents);

  const { data, error } = await supabase
    .from("agent_learning_events")
    .select("*, agents!inner(user_id)")
    .eq("agents.user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as AgentLearningEvent[];
}

export async function listMemory(userId: string): Promise<AgentMemory[]> {
  const supabase = admin();
  if (!supabase) return demoOrThrow(demoMemory);

  const { data, error } = await supabase
    .from("agent_memory")
    .select("*, agents!inner(user_id)")
    .eq("agents.user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as AgentMemory[];
}

export async function listLeads(userId: string): Promise<ExtractedLead[]> {
  const supabase = admin();
  if (!supabase) return demoOrThrow(demoLeads);

  const { data, error } = await supabase
    .from("extracted_leads")
    .select("*, agents!inner(user_id)")
    .eq("agents.user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as ExtractedLead[];
}

export async function listUnansweredQuestions(userId: string): Promise<UnansweredQuestion[]> {
  const supabase = admin();
  if (!supabase) return demoOrThrow(demoUnansweredQuestions);

  const { data, error } = await supabase
    .from("unanswered_questions")
    .select("*, agents!inner(user_id)")
    .eq("agents.user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as UnansweredQuestion[];
}
