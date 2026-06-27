import type { NextRequest } from "next/server";
import { generateGeminiText, isGeminiTtsEnabled } from "@/lib/ai/gemini";
import { fillTemplate, getDemoScenario } from "@/lib/public-demo/scenarios";
import { speakGatherXml } from "@/lib/public-demo/xml";
import { publicBaseUrl } from "@/lib/public-demo/url";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

async function generateOpeningLine({
  name,
  useCase,
  scenario
}: {
  name: string;
  useCase: string;
  scenario: ReturnType<typeof getDemoScenario>;
}) {
  try {
    const line = await generateGeminiText(
      [
        {
          role: "user",
          text: `${scenario.systemPrompt}

Caller name: ${name}
Landing-page use case: ${useCase || "not provided"}

Start this phone call. Do not mention that you are AI unless it is natural. Use one short, warm opening line and one clear question. No paragraphs. Sound like a real receptionist in India.`
        }
      ],
      { temperature: 0.55, maxOutputTokens: 80 }
    );
    if (line.trim()) return line.trim();
  } catch {
    // The fixed fallback keeps the phone flow alive if Gemini is unavailable.
  }

  return fillTemplate(scenario.firstPrompt, { name, use_case: useCase });
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const callId = url.searchParams.get("call_id") || "";
  const scenarioId = url.searchParams.get("scenario") as Parameters<typeof getDemoScenario>[0];
  const name = url.searchParams.get("name") || "there";
  const useCase = url.searchParams.get("use_case") || "";
  const scenario = getDemoScenario(scenarioId);
  const baseUrl = publicBaseUrl(request);
  const openingLine = await generateOpeningLine({ name, useCase, scenario });
  let openingMessageId = "";

  const supabase = createSupabaseAdminClient();
  if (supabase && callId) {
    await supabase.from("calls").update({ status: "in_progress" }).eq("id", callId);
    const { data: call } = await supabase.from("calls").select("agent_id").eq("id", callId).single();
    if (call?.agent_id) {
      const { data: message } = await supabase
        .from("call_messages")
        .insert({
          call_id: callId,
          agent_id: call.agent_id,
          role: "assistant",
          content: openingLine,
          latency_ms: 0
        })
        .select("id")
        .single();
      openingMessageId = message?.id || "";
    }
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
