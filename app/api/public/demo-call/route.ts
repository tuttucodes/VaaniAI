import type { NextRequest } from "next/server";
import { ok, fail, handleApiError } from "@/lib/api";
import { publicDemoCallSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getPublicDemoAgent } from "@/lib/public-demo/storage";
import { publicBaseUrl, assertPublicHttpsUrl } from "@/lib/public-demo/url";
import { vobizProvider } from "@/lib/telephony/vobiz";

export async function POST(request: NextRequest) {
  try {
    const limited = rateLimit(request, 8);
    if (!limited.ok) return fail("Rate limit exceeded", 429);

    const input = publicDemoCallSchema.parse(await request.json());
    const baseUrl = publicBaseUrl(request);
    assertPublicHttpsUrl(baseUrl);

    const supabase = createSupabaseAdminClient();
    if (!supabase) throw new Error("Supabase is required for public demo calls.");

    const { user, agent, scenario } = await getPublicDemoAgent(input.scenario);
    const { data: call, error: callError } = await supabase
      .from("calls")
      .insert({
        user_id: user.id,
        agent_id: agent.id,
        phone_number: input.phone_number,
        direction: "outbound",
        status: "queued",
        started_at: new Date().toISOString(),
        summary: `Public demo call: ${scenario.title} for ${input.name}. Use case: ${input.use_case}`
      })
      .select("*")
      .single();
    if (callError) throw callError;

    const params = new URLSearchParams({
      call_id: call.id,
      scenario: scenario.id,
      name: input.name,
      use_case: input.use_case
    });

    const telephony = await vobizProvider.createXmlOutboundCall({
      to: input.phone_number,
      from: process.env.VOBIZ_PHONE_NUMBER || process.env.DEFAULT_FROM_NUMBER,
      answerUrl: `${baseUrl}/api/vobiz/demo-answer?${params.toString()}`,
      ringUrl: `${baseUrl}/api/vobiz/demo-ring?call_id=${call.id}`,
      hangupUrl: `${baseUrl}/api/vobiz/demo-hangup?call_id=${call.id}`,
      fallbackUrl: `${baseUrl}/api/vobiz/demo-answer?${params.toString()}`,
      callerName: "Vaani AI",
      timeLimitSeconds: 240,
      metadata: { scenario: scenario.id }
    });

    await supabase
      .from("calls")
      .update({
        vobiz_call_id: telephony.providerCallId || null,
        status: telephony.status === "queued" ? "queued" : "failed",
        summary:
          telephony.status === "queued"
            ? `Public demo call queued: ${scenario.title} for ${input.name}.`
            : `Public demo call could not be placed. ${JSON.stringify(telephony.raw || telephony.todo || {})}`
      })
      .eq("id", call.id);

    return ok({ call_id: call.id, scenario: scenario.id, telephony }, { status: telephony.status === "queued" ? 201 : 502 });
  } catch (error) {
    return handleApiError(error);
  }
}

