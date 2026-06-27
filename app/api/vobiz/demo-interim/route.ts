import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const callId = url.searchParams.get("call_id") || "";
  const supabase = createSupabaseAdminClient();
  if (!supabase || !callId) return ok({ ok: true });

  const form = await request.formData().catch(() => null);
  const stable = String(form?.get("StableSpeech") || "").trim();
  const unstable = String(form?.get("UnstableSpeech") || "").trim();
  const stability = String(form?.get("Stability") || "");
  const sequence = String(form?.get("SequenceNumber") || "");
  const heard = [stable, unstable].filter(Boolean).join(" ").trim();
  if (!heard) return ok({ ok: true });

  const { data: call } = await supabase.from("calls").select("agent_id").eq("id", callId).single();
  if (call?.agent_id) {
    await supabase.from("call_messages").insert({
      call_id: callId,
      agent_id: call.agent_id,
      role: "system",
      content: `Interim speech ${sequence || "?"} (${stability || "unknown"}): ${heard}`,
      latency_ms: 0
    });
  }

  return ok({ ok: true });
}

export const GET = POST;
