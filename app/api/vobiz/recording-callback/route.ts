import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

function getRecordingValue(payload: FormData | Record<string, unknown>, key: string) {
  if (payload instanceof FormData) {
    const value = payload.get(key);
    return typeof value === "string" ? value : "";
  }
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

function pickRecordingUrl(payload: FormData | Record<string, unknown>) {
  return (
    getRecordingValue(payload, "RecordUrl") ||
    getRecordingValue(payload, "RecordingUrl") ||
    getRecordingValue(payload, "recording_url") ||
    getRecordingValue(payload, "record_url") ||
    getRecordingValue(payload, "url")
  );
}

export async function POST(request: NextRequest) {
  const callId = new URL(request.url).searchParams.get("call_id") || "";
  const contentType = request.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? ((await request.json().catch(() => ({}))) as Record<string, unknown>)
    : await request.formData().catch(() => new FormData());
  const recordingUrl = pickRecordingUrl(payload);
  const recordingId = getRecordingValue(payload, "RecordingID") || getRecordingValue(payload, "recording_id");
  const recordingDuration =
    getRecordingValue(payload, "RecordingDuration") ||
    getRecordingValue(payload, "RecordingDurationMs") ||
    getRecordingValue(payload, "recording_duration");
  const reason = getRecordingValue(payload, "RecordingEndReason") || getRecordingValue(payload, "recording_end_reason");

  const supabase = createSupabaseAdminClient();
  if (!supabase || !callId) return ok({ ok: true });

  const { data: call } = await supabase.from("calls").select("agent_id").eq("id", callId).single();
  if (recordingUrl) {
    await supabase.from("calls").update({ recording_url: recordingUrl }).eq("id", callId);
  }
  if (call?.agent_id) {
    await supabase.from("call_messages").insert({
      call_id: callId,
      agent_id: call.agent_id,
      role: "system",
      content: recordingUrl
        ? `Vobiz recording ready${recordingId ? ` (${recordingId})` : ""}${recordingDuration ? `, duration ${recordingDuration}` : ""}.`
        : `Vobiz recording callback received${reason ? ` (${reason})` : ""}, but no recording URL was present.`
    });
  }

  return ok({ ok: true, recording_url: Boolean(recordingUrl) });
}

export const GET = POST;
