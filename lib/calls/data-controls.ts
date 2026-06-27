import { demoLeads, demoMessages, demoMetrics, demoInsight, demoUnansweredQuestions } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCall } from "@/lib/data";

export async function exportCallData(userId: string, callId: string) {
  const supabase = createSupabaseAdminClient();
  const call = await getCall(userId, callId);
  if (!call) throw new Error("Call not found");

  if (!supabase && isDemoMode()) {
    return {
      exported_at: new Date().toISOString(),
      call,
      messages: demoMessages.filter((message) => message.call_id === callId),
      metrics: demoMetrics.call_id === callId ? [demoMetrics] : [demoMetrics],
      insights: demoInsight.call_id === callId ? [demoInsight] : [demoInsight],
      leads: demoLeads.filter((lead) => lead.call_id === callId),
      unanswered_questions: demoUnansweredQuestions.filter((question) => question.call_id === callId),
      references: []
    };
  }

  if (!supabase) throw new Error("Supabase is not configured.");

  const [messages, metrics, insights, leads, unansweredQuestions, references] = await Promise.all([
    supabase.from("call_messages").select("*").eq("call_id", callId).order("timestamp", { ascending: true }),
    supabase.from("call_metrics").select("*").eq("call_id", callId).order("created_at", { ascending: true }),
    supabase.from("call_insights").select("*").eq("call_id", callId),
    supabase.from("extracted_leads").select("*").eq("call_id", callId),
    supabase.from("unanswered_questions").select("*").eq("call_id", callId),
    supabase.from("call_references").select("*, agent_knowledge_chunks(source_reference, summary)").eq("call_id", callId)
  ]);

  for (const result of [messages, metrics, insights, leads, unansweredQuestions, references]) {
    if (result.error) throw result.error;
  }

  return {
    exported_at: new Date().toISOString(),
    call,
    messages: messages.data || [],
    metrics: metrics.data || [],
    insights: insights.data || [],
    leads: leads.data || [],
    unanswered_questions: unansweredQuestions.data || [],
    references: references.data || []
  };
}

export async function deleteCallData(userId: string, callId: string) {
  const supabase = createSupabaseAdminClient();
  const call = await getCall(userId, callId);
  if (!call) throw new Error("Call not found");

  if (!supabase && isDemoMode()) {
    return {
      deleted: true,
      call_id: callId,
      demo: true
    };
  }

  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase.from("calls").delete().eq("id", callId).eq("user_id", userId);
  if (error) throw error;

  return {
    deleted: true,
    call_id: callId,
    demo: false
  };
}
