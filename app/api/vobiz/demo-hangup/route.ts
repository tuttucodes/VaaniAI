import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { analyzeCallTranscript, insightFromAnalysis } from "@/lib/ai/gemini";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const callId = new URL(request.url).searchParams.get("call_id");
  const supabase = createSupabaseAdminClient();
  if (!supabase || !callId) return ok({ ok: true });

  const { data: call } = await supabase.from("calls").select("*, agents(*)").eq("id", callId).single();
  if (!call?.agents) return ok({ ok: true });

  const { data: messages } = await supabase.from("call_messages").select("*").eq("call_id", callId).order("timestamp", { ascending: true });
  const transcript = (messages || []).map((message) => `${message.role}: ${message.content}`).join("\n");
  const analysis = await analyzeCallTranscript({ transcript, agentPrompt: call.agents.system_prompt });

  await supabase.from("call_insights").upsert(insightFromAnalysis(analysis, callId, call.agent_id), { onConflict: "call_id" });
  await supabase
    .from("calls")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      summary: analysis.summary || call.summary
    })
    .eq("id", callId);

  return ok({ ok: true });
}

export const GET = POST;

