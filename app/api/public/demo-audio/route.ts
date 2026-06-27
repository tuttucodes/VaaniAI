import type { NextRequest } from "next/server";
import { fail } from "@/lib/api";
import { generateGeminiTtsWav } from "@/lib/ai/gemini";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const callId = url.searchParams.get("call_id") || "";
  const messageId = url.searchParams.get("message_id") || "";

  if (!callId || !messageId) return fail("Missing audio reference", 400);

  const supabase = createSupabaseAdminClient();
  if (!supabase) return fail("Audio is not configured", 503);

  const { data: message } = await supabase
    .from("call_messages")
    .select("content")
    .eq("id", messageId)
    .eq("call_id", callId)
    .eq("role", "assistant")
    .single();

  if (!message?.content) return fail("Audio message not found", 404);

  const wav = await generateGeminiTtsWav({ text: message.content.slice(0, 700) });
  return new Response(wav, {
    headers: {
      "content-type": "audio/wav",
      "cache-control": "public, max-age=3600, immutable",
      "content-length": String(wav.length)
    }
  });
}
