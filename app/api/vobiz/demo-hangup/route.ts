import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { analyzeCallTranscript, insightFromAnalysis } from "@/lib/ai/gemini";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { fetchVobizRecordingUrl } from "@/lib/telephony/vobiz";

export async function POST(request: NextRequest) {
  const callId = new URL(request.url).searchParams.get("call_id");
  const supabase = createSupabaseAdminClient();
  if (!supabase || !callId) return ok({ ok: true });

  const { data: call } = await supabase.from("calls").select("*, agents(*)").eq("id", callId).single();
  if (!call?.agents) return ok({ ok: true });
  const recordingUrl = call.vobiz_call_id ? await fetchVobizRecordingUrl(call.vobiz_call_id).catch(() => "") : "";

  const { data: messages } = await supabase.from("call_messages").select("*").eq("call_id", callId).order("timestamp", { ascending: true });
  const hasUserSpeech = (messages || []).some((message) => message.role === "user");
  if (!hasUserSpeech) {
    await supabase.from("call_insights").upsert(
      {
        call_id: callId,
        agent_id: call.agent_id,
        intent: "no_user_speech",
        sentiment: "unknown",
        outcome: "no_response_captured",
        objections: [],
        questions: [],
        answers: [],
        follow_up_required: true,
        extracted_data: {
          reason: "The call ended without a captured user transcript. Review telephony speech callbacks or move this route to Vobiz Stream/LiveKit."
        }
      },
      { onConflict: "call_id" }
    );
    await supabase
      .from("calls")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
        ...(recordingUrl ? { recording_url: recordingUrl } : {}),
        summary: "Call ended without captured caller speech. No AI analysis was run."
      })
      .eq("id", callId);
    return ok({ ok: true, skipped_analysis: true });
  }

  const transcript = (messages || []).map((message) => `${message.role}: ${message.content}`).join("\n");
  const analysis = await analyzeCallTranscript({ transcript, agentPrompt: call.agents.system_prompt });

  await supabase.from("call_insights").upsert(insightFromAnalysis(analysis, callId, call.agent_id), { onConflict: "call_id" });
  await supabase
    .from("calls")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      ...(recordingUrl ? { recording_url: recordingUrl } : {}),
      summary: analysis.summary || call.summary
    })
    .eq("id", callId);

  return ok({ ok: true });
}

export const GET = POST;
