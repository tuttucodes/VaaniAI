import type { NextRequest } from "next/server";
import { speakHangupXml, streamXml } from "@/lib/public-demo/xml";
import { publicBaseUrl } from "@/lib/public-demo/url";
import { isAllowedVoiceAssetUrl } from "@/lib/voice/opening-audio";

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const callId = url.searchParams.get("call_id") || "";
  const openingMessageId = url.searchParams.get("opening_message_id") || "";
  const requestedOpeningAudioUrl = url.searchParams.get("opening_audio_url") || "";
  const callerName = (url.searchParams.get("name") || "there").trim().slice(0, 80) || "there";
  const baseUrl = publicBaseUrl(request);
  const streamBaseUrl = process.env.VOBIZ_STREAM_WS_URL || "";
  const openingAudioUrl = isAllowedVoiceAssetUrl(requestedOpeningAudioUrl, process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    ? requestedOpeningAudioUrl
    : "";

  if (!streamBaseUrl.startsWith("wss://")) {
    return speakHangupXml("The Adda247 voice guide is not available right now. Please try again shortly.");
  }

  const streamUrl = new URL(streamBaseUrl);
  streamUrl.searchParams.set("call_id", callId);
  streamUrl.searchParams.set("scenario", "adda247");
  streamUrl.searchParams.set("name", callerName);
  streamUrl.searchParams.set("use_case", "Adda247 course guidance");
  streamUrl.searchParams.set("opening_message_id", openingMessageId);
  if (openingAudioUrl) streamUrl.searchParams.set("opening_audio_url", openingAudioUrl);

  return streamXml({
    streamUrl: streamUrl.toString(),
    statusCallbackUrl: `${baseUrl}/api/vobiz/demo-stream-status?call_id=${encodeURIComponent(callId)}`,
    recordingCallbackUrl: `${baseUrl}/api/vobiz/recording-callback?call_id=${encodeURIComponent(callId)}`
  });
}

export const GET = POST;
