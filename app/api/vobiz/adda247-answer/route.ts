import type { NextRequest } from "next/server";
import { speakHangupXml, streamXml } from "@/lib/public-demo/xml";
import { publicBaseUrl } from "@/lib/public-demo/url";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const callId = url.searchParams.get("call_id") || "";
  const openingMessageId = url.searchParams.get("opening_message_id") || "";
  const callerName = (url.searchParams.get("name") || "there").trim().slice(0, 80) || "there";
  const baseUrl = publicBaseUrl(request);
  const streamBaseUrl = process.env.VOBIZ_STREAM_WS_URL || "";
  const supabase = createSupabaseAdminClient();

  if (supabase && callId) {
    await supabase.from("calls").update({ status: "in_progress" }).eq("id", callId);
  }

  if (!streamBaseUrl.startsWith("wss://")) {
    return speakHangupXml("The Adda247 voice guide is not available right now. Please try again shortly.");
  }

  const streamUrl = new URL(streamBaseUrl);
  streamUrl.searchParams.set("call_id", callId);
  streamUrl.searchParams.set("scenario", "adda247");
  streamUrl.searchParams.set("name", callerName);
  streamUrl.searchParams.set("use_case", "Adda247 course guidance");
  streamUrl.searchParams.set("opening_message_id", openingMessageId);

  return streamXml({
    streamUrl: streamUrl.toString(),
    statusCallbackUrl: `${baseUrl}/api/vobiz/demo-stream-status?call_id=${encodeURIComponent(callId)}`,
    recordingCallbackUrl: `${baseUrl}/api/vobiz/recording-callback?call_id=${encodeURIComponent(callId)}`
  });
}

export const GET = POST;
