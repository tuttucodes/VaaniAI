import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const callId = new URL(request.url).searchParams.get("call_id") || "";
  const supabase = createSupabaseAdminClient();
  if (!supabase || !callId) return ok({ ok: true });

  const form = await request.formData().catch(() => null);
  const event = String(form?.get("Event") || form?.get("event") || "stream_event");
  const streamId = String(form?.get("StreamID") || form?.get("stream_id") || "");
  const { data: call } = await supabase.from("calls").select("agent_id").eq("id", callId).single();

  if (call?.agent_id) {
    await supabase.from("call_messages").insert({
      call_id: callId,
      agent_id: call.agent_id,
      role: "system",
      content: `Vobiz stream event: ${event}${streamId ? ` (${streamId})` : ""}`,
      latency_ms: 0
    });
  }

  return ok({ ok: true });
}

export const GET = POST;
