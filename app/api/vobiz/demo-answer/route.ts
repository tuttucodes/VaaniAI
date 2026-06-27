import type { NextRequest } from "next/server";
import { fillTemplate, getDemoScenario } from "@/lib/public-demo/scenarios";
import { speakGatherXml } from "@/lib/public-demo/xml";
import { publicBaseUrl } from "@/lib/public-demo/url";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const callId = url.searchParams.get("call_id") || "";
  const scenarioId = url.searchParams.get("scenario") as Parameters<typeof getDemoScenario>[0];
  const name = url.searchParams.get("name") || "there";
  const useCase = url.searchParams.get("use_case") || "";
  const scenario = getDemoScenario(scenarioId);
  const baseUrl = publicBaseUrl(request);

  const supabase = createSupabaseAdminClient();
  if (supabase && callId) {
    await supabase.from("calls").update({ status: "in_progress" }).eq("id", callId);
    const { data: call } = await supabase.from("calls").select("agent_id").eq("id", callId).single();
    if (call?.agent_id) {
      await supabase.from("call_messages").insert({
        call_id: callId,
        agent_id: call.agent_id,
        role: "assistant",
        content: fillTemplate(scenario.firstPrompt, { name, use_case: useCase }),
        latency_ms: 0
      });
    }
  }

  const params = new URLSearchParams({
    call_id: callId,
    scenario: scenario.id,
    name,
    use_case: useCase,
    turn: "1"
  });

  return speakGatherXml({
    message: fillTemplate(scenario.firstPrompt, { name, use_case: useCase }),
    actionUrl: `${baseUrl}/api/vobiz/demo-gather?${params.toString()}`,
    fallbackUrl: `${baseUrl}/api/vobiz/demo-noinput?${params.toString()}`,
    interimUrl: `${baseUrl}/api/vobiz/demo-interim?${params.toString()}`,
    hints: scenario.hints
  });
}

export const GET = POST;
