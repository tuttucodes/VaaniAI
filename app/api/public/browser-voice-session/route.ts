import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api";
import { getPublicDemoAgent } from "@/lib/public-demo/storage";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const scenarioMap: Record<string, "dental" | "restaurant" | "real_estate"> = {
  "appointment-booking": "dental",
  "cart-recovery": "restaurant",
  "payment-followups": "real_estate"
};

export async function POST(request: NextRequest) {
  try {
    const limited = rateLimit(request, 20);
    if (!limited.ok) return fail("Rate limit exceeded", 429);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const streamBaseUrl = process.env.VOBIZ_STREAM_WS_URL || "";
    if (!streamBaseUrl.startsWith("wss://") && !streamBaseUrl.startsWith("ws://")) {
      return fail("Browser voice streaming is not configured.", 503);
    }

    const supabase = createSupabaseAdminClient();
    if (!supabase) return fail("Browser voice storage is not configured.", 503);

    const scenarioId = typeof body.scenario_id === "string" ? body.scenario_id : "appointment-booking";
    const context = typeof body.context === "string" ? body.context.slice(0, 1800) : "";
    const scenario = scenarioMap[scenarioId] || "dental";
    const { user, agent, scenario: demoScenario } = await getPublicDemoAgent(scenario);

    const { data: call, error } = await supabase
      .from("calls")
      .insert({
        user_id: user.id,
        agent_id: agent.id,
        phone_number: "browser-demo",
        direction: "inbound",
        status: "queued",
        started_at: new Date().toISOString(),
        livekit_room_name: `browser-${scenario}-${Date.now()}`,
        summary: `Browser voice demo: ${demoScenario.title}. Context: ${context || "default scenario"}`
      })
      .select("id")
      .single();
    if (error || !call?.id) throw error || new Error("Could not create browser voice call.");

    const streamId = `browser-${call.id}`;
    const wsUrl = new URL(streamBaseUrl);
    wsUrl.searchParams.set("call_id", call.id);
    wsUrl.searchParams.set("scenario", scenario);
    wsUrl.searchParams.set("name", "Browser demo visitor");
    wsUrl.searchParams.set("use_case", context || "Browser voice demo session");
    wsUrl.searchParams.set("transport", "browser");

    return ok({
      call_id: call.id,
      stream_id: streamId,
      ws_url: wsUrl.toString(),
      scenario
    });
  } catch (error) {
    console.error("Browser voice session failed", error);
    return fail("Browser voice session could not be started.", 500);
  }
}
