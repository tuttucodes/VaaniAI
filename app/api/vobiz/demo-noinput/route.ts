import type { NextRequest } from "next/server";
import { getDemoScenario } from "@/lib/public-demo/scenarios";
import { speakGatherXml, speakHangupXml } from "@/lib/public-demo/xml";
import { publicBaseUrl } from "@/lib/public-demo/url";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const callId = url.searchParams.get("call_id") || "";
  const scenarioId = url.searchParams.get("scenario") as Parameters<typeof getDemoScenario>[0];
  const name = url.searchParams.get("name") || "there";
  const useCase = url.searchParams.get("use_case") || "";
  const retry = Number(url.searchParams.get("retry") || "0");
  const scenario = getDemoScenario(scenarioId);
  const baseUrl = publicBaseUrl(request);
  const supabase = createSupabaseAdminClient();

  const { data: call } = supabase && callId ? await supabase.from("calls").select("agent_id").eq("id", callId).single() : { data: null };

  if (supabase && call?.agent_id) {
    await supabase.from("call_messages").insert({
      call_id: callId,
      agent_id: call.agent_id,
      role: "system",
      content: `No caller speech detected on retry ${retry}.`,
      latency_ms: 0
    });
  }

  if (retry >= 1) {
    if (supabase && callId) {
      await supabase
        .from("calls")
        .update({
          status: "completed",
          ended_at: new Date().toISOString(),
          summary: "Demo call ended because no caller speech was detected."
        })
        .eq("id", callId);
    }
    return speakHangupXml(`Sorry ${name}, I still could not hear you clearly. The team will follow up from the details you entered. Goodbye.`);
  }

  const params = new URLSearchParams({
    call_id: callId,
    scenario: scenario.id,
    name,
    use_case: useCase,
    turn: "1",
    retry: String(retry + 1)
  });

  return speakGatherXml({
    message: `Sorry ${name}, I could not hear that clearly. Please speak after this sentence. You can say it in English, Hindi, Malayalam, or mixed speech.`,
    actionUrl: `${baseUrl}/api/vobiz/demo-gather?${params.toString()}`,
    fallbackUrl: `${baseUrl}/api/vobiz/demo-noinput?${params.toString()}`,
    interimUrl: `${baseUrl}/api/vobiz/demo-interim?${params.toString()}`,
    hints: scenario.hints
  });
}

export const GET = POST;
