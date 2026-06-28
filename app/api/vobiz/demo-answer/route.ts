import type { NextRequest } from "next/server";
import { isGeminiTtsEnabled } from "@/lib/ai/gemini";
import { fillTemplate, getDemoScenario } from "@/lib/public-demo/scenarios";
import { speakGatherXml, streamXml } from "@/lib/public-demo/xml";
import { publicBaseUrl } from "@/lib/public-demo/url";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const callId = url.searchParams.get("call_id") || "";
  const scenarioId = url.searchParams.get("scenario") as Parameters<typeof getDemoScenario>[0];
  const name = url.searchParams.get("name") || "there";
  const useCase = url.searchParams.get("use_case") || "";
  const openingMessageId = url.searchParams.get("opening_message_id") || "";
  const scenario = getDemoScenario(scenarioId);
  const baseUrl = publicBaseUrl(request);
  let openingLine = fillTemplate(scenario.firstPrompt, { name, use_case: useCase });
  const streamBaseUrl = process.env.VOBIZ_STREAM_WS_URL || "";
  const useStream = process.env.PUBLIC_DEMO_USE_STREAM === "true" && streamBaseUrl.startsWith("wss://");

  const supabase = createSupabaseAdminClient();
  if (supabase && callId) {
    await supabase.from("calls").update({ status: "in_progress" }).eq("id", callId);
    if (openingMessageId) {
      const { data: message } = await supabase
        .from("call_messages")
        .select("content")
        .eq("id", openingMessageId)
        .eq("call_id", callId)
        .eq("role", "assistant")
        .single();
      openingLine = message?.content || openingLine;
    }
  }

  if (useStream) {
    const streamUrl = new URL(streamBaseUrl);
    streamUrl.searchParams.set("call_id", callId);
    streamUrl.searchParams.set("scenario", scenario.id);
    streamUrl.searchParams.set("name", name);
    streamUrl.searchParams.set("use_case", useCase);
    streamUrl.searchParams.set("opening_message_id", openingMessageId);

    return streamXml({
      streamUrl: streamUrl.toString(),
      statusCallbackUrl: `${baseUrl}/api/vobiz/demo-stream-status?call_id=${encodeURIComponent(callId)}`
    });
  }

  const params = new URLSearchParams({
    call_id: callId,
    scenario: scenario.id,
    name,
    use_case: useCase,
    turn: "1"
  });
  const audioUrl =
    isGeminiTtsEnabled() && callId && openingMessageId
      ? `${baseUrl}/api/public/demo-audio?call_id=${encodeURIComponent(callId)}&message_id=${encodeURIComponent(openingMessageId)}`
      : undefined;

  return speakGatherXml({
    message: openingLine,
    audioUrl,
    actionUrl: `${baseUrl}/api/vobiz/demo-gather?${params.toString()}`,
    fallbackUrl: `${baseUrl}/api/vobiz/demo-noinput?${params.toString()}`,
    interimUrl: `${baseUrl}/api/vobiz/demo-interim?${params.toString()}`,
    hints: scenario.hints
  });
}

export const GET = POST;
