import type { NextRequest } from "next/server";
import { generateGeminiText, isGeminiTtsEnabled } from "@/lib/ai/gemini";
import { getDemoScenario } from "@/lib/public-demo/scenarios";
import { speakGatherXml, speakHangupXml } from "@/lib/public-demo/xml";
import { publicBaseUrl } from "@/lib/public-demo/url";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { estimateLiveTurnCostInr } from "@/lib/ai/gemini";

function fallbackReply({ speech, name, scenario }: { speech: string; name: string; scenario: ReturnType<typeof getDemoScenario> }) {
  if (scenario.id === "dental") {
    if (/pain|tooth|sensitivity|swelling|fever/i.test(speech)) {
      return `Got it, ${name}. Is there any swelling, fever, bleeding, or injury with the tooth pain?`;
    }
    return `Thanks, ${name}. I can note that for Pearl Dental Care. What time would you prefer for a callback?`;
  }
  if (scenario.id === "real_estate") {
    return `Got it, ${name}. Which location and budget range should I note for your property search?`;
  }
  return `Sure, ${name}. What date, time, and party size should I note for the reservation request?`;
}

export async function POST(request: NextRequest) {
  const startedAt = performance.now();
  const url = new URL(request.url);
  const callId = url.searchParams.get("call_id") || "";
  const scenarioId = url.searchParams.get("scenario") as Parameters<typeof getDemoScenario>[0];
  const name = url.searchParams.get("name") || "there";
  const useCase = url.searchParams.get("use_case") || "";
  const turn = Number(url.searchParams.get("turn") || "1");
  const baseUrl = publicBaseUrl(request);
  const scenario = getDemoScenario(scenarioId);
  const form = await request.formData().catch(() => null);
  const speech = String(
    form?.get("Speech") ||
      form?.get("speech") ||
      form?.get("StableSpeech") ||
      form?.get("stable_speech") ||
      form?.get("Digits") ||
      form?.get("digits") ||
      ""
  ).trim();
  const inputType = String(form?.get("InputType") || form?.get("input_type") || "").toLowerCase();
  const confidence = Number(form?.get("SpeechConfidenceScore") || form?.get("speech_confidence_score") || 0);

  const supabase = createSupabaseAdminClient();
  const { data: call } = supabase && callId ? await supabase.from("calls").select("agent_id").eq("id", callId).single() : { data: null };
  let assistantMessageId = "";

  if (supabase && call?.agent_id && speech) {
    await supabase.from("call_messages").insert({
      call_id: callId,
      agent_id: call.agent_id,
      role: "user",
      content: inputType === "dtmf" ? `Pressed ${speech}` : speech,
      latency_ms: 0
    });
  }

  let reply = "";
  try {
    reply = await generateGeminiText(
      [
        {
          role: "user",
          text: `${scenario.systemPrompt}

Caller name: ${name}
Landing-page use case: ${useCase}
Latest caller utterance: ${speech || "(no speech detected)"}
Speech confidence: ${confidence || "unknown"}

Reply in one or two short spoken sentences. Mirror Indian English naturally. If the caller mixes English with Malayalam, Hindi, Tamil, Telugu, or Kannada words, acknowledge naturally in simple English or the same mixed style. Ask only one question at a time. If this is turn ${turn} or later, gently summarize what you captured and say the team will follow up.`
        }
      ],
      { temperature: 0.45, maxOutputTokens: 140 }
    );
  } catch {
    reply = fallbackReply({ speech, name, scenario });
  }

  if (!reply.trim()) reply = fallbackReply({ speech, name, scenario });
  const latency = Math.round(performance.now() - startedAt);

  if (supabase && call?.agent_id) {
    const { data: assistantMessage } = await supabase
      .from("call_messages")
      .insert({
        call_id: callId,
        agent_id: call.agent_id,
        role: "assistant",
        content: reply,
        latency_ms: latency
      })
      .select("id")
      .single();
    assistantMessageId = assistantMessage?.id || "";

    await supabase.from("call_metrics").insert({
      call_id: callId,
      speech_end_to_transcript_ms: 0,
      transcript_to_first_token_ms: latency,
      first_token_to_first_audio_ms: 0,
      total_response_latency_ms: latency,
      average_response_latency_ms: latency,
      estimated_cost: estimateLiveTurnCostInr({
        inputTokens: Math.ceil((speech.length + scenario.systemPrompt.length) / 4),
        outputTokens: Math.ceil(reply.length / 4),
        audioSeconds: Math.max(3, reply.length / 13),
        mode: "economy"
      })
    });

    if (assistantMessage && turn >= 2) {
      await supabase
        .from("calls")
        .update({
          status: "completed",
          ended_at: new Date().toISOString(),
          duration_seconds: 120,
          summary: `Public demo completed. Last captured user response: ${speech || "none"}`
        })
        .eq("id", callId);
    }
  }

  if (turn >= 2) {
    return speakHangupXml(`${reply} Thanks for trying Vaani AI. Goodbye.`);
  }

  const params = new URLSearchParams({
    call_id: callId,
    scenario: scenario.id,
    name,
    use_case: useCase,
    turn: String(turn + 1)
  });

  return speakGatherXml({
    message: reply,
    audioUrl:
      isGeminiTtsEnabled() && callId && assistantMessageId
        ? `${baseUrl}/api/public/demo-audio?call_id=${encodeURIComponent(callId)}&message_id=${encodeURIComponent(assistantMessageId)}`
        : undefined,
    actionUrl: `${baseUrl}/api/vobiz/demo-gather?${params.toString()}`,
    fallbackUrl: `${baseUrl}/api/vobiz/demo-noinput?${params.toString()}`,
    interimUrl: `${baseUrl}/api/vobiz/demo-interim?${params.toString()}`,
    hints: scenario.hints
  });
}

export const GET = POST;
