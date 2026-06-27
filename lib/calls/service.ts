import { analyzeCallTranscript, insightFromAnalysis } from "@/lib/ai/gemini";
import { demoCalls } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { ensureLiveKitRoom, liveKitRoomName } from "@/lib/livekit/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { vobizProvider } from "@/lib/telephony/vobiz";
import type { Call } from "@/lib/types";
import type { StartCallInput } from "@/lib/validation";

function statusFromVobiz(status?: string) {
  const normalized = status?.toLowerCase();
  if (!normalized) return "queued";
  if (["ringing", "queued", "in_progress", "completed", "failed", "canceled"].includes(normalized)) {
    return normalized;
  }
  if (normalized.includes("answer") || normalized.includes("connect")) return "in_progress";
  if (normalized.includes("complete") || normalized.includes("hangup")) return "completed";
  if (normalized.includes("fail")) return "failed";
  return "queued";
}

export async function startCall(userId: string, input: StartCallInput) {
  const supabase = createSupabaseAdminClient();

  if (!supabase && isDemoMode()) {
    const call = {
      ...demoCalls[0],
      id: crypto.randomUUID(),
      user_id: userId,
      agent_id: input.agent_id,
      phone_number: input.phone_number,
      status: "queued",
      livekit_room_name: `demo_${Date.now()}`
    } satisfies Call;
    return {
      call,
      livekit: await ensureLiveKitRoom({ roomName: call.livekit_room_name || `demo_${Date.now()}` }),
      telephony: {
        provider: "vobiz",
        status: "requires_configuration",
        todo: ["Set Vobiz env vars to place real calls."]
      }
    };
  }
  if (!supabase) throw new Error("Supabase is not configured. Calls require Supabase outside demo mode.");

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("*")
    .eq("id", input.agent_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (agentError) throw agentError;
  if (!agent) throw new Error("Agent not found");

  const { data: insertedCall, error: callError } = await supabase
    .from("calls")
    .insert({
      user_id: userId,
      agent_id: input.agent_id,
      phone_number: input.phone_number,
      direction: input.direction,
      status: "queued",
      started_at: new Date().toISOString()
    })
    .select("*")
    .single();
  if (callError) throw callError;

  const roomName = liveKitRoomName(insertedCall.id);
  const livekit = await ensureLiveKitRoom({
    roomName,
    metadata: {
      callId: insertedCall.id,
      agentId: input.agent_id,
      userId
    }
  });

  const telephony = await vobizProvider.createOutboundCall({
    to: input.phone_number,
    from: process.env.DEFAULT_FROM_NUMBER,
    agentId: input.agent_id,
    callId: insertedCall.id,
    livekitRoomName: roomName,
    sipConfig: (agent.vobiz_config || {}) as Record<string, unknown>,
    metadata: input.metadata
  });
  const telephonyReady = telephony.status !== "requires_configuration" && telephony.status !== "failed";

  const { data: call, error: updateError } = await supabase
    .from("calls")
    .update({
      livekit_room_name: roomName,
      vobiz_call_id: telephony.providerCallId || null,
      status: telephonyReady ? "queued" : "failed",
      summary: telephonyReady
        ? null
        : "Outbound call was not placed because the Vobiz provider is not fully configured."
    })
    .eq("id", insertedCall.id)
    .select("*, agents(name, voice_id)")
    .single();
  if (updateError) throw updateError;

  return {
    call: call as Call,
    livekit,
    telephony
  };
}

export async function endCall(userId: string, callId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase && isDemoMode()) {
    return {
      call: {
        ...demoCalls[0],
        id: callId,
        status: "completed",
        ended_at: new Date().toISOString()
      } satisfies Call,
      analyzed: true,
      demo: true
    };
  }
  if (!supabase) throw new Error("Supabase is not configured. Calls require Supabase outside demo mode.");

  const { data: call, error: callError } = await supabase
    .from("calls")
    .select("*")
    .eq("id", callId)
    .eq("user_id", userId)
    .maybeSingle();
  if (callError) throw callError;
  if (!call) throw new Error("Call not found");

  const endedAt = new Date();
  const startedAt = call.started_at ? new Date(call.started_at) : endedAt;
  const duration = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));

  const { data: updatedCall, error: updateError } = await supabase
    .from("calls")
    .update({
      status: "completed",
      ended_at: endedAt.toISOString(),
      duration_seconds: duration
    })
    .eq("id", callId)
    .select("*")
    .single();
  if (updateError) throw updateError;

  await runPostCallAnalysis(userId, callId);

  return {
    call: updatedCall as Call,
    analyzed: true,
    demo: false
  };
}

export async function runPostCallAnalysis(userId: string, callId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const { data: call, error: callError } = await supabase
    .from("calls")
    .select("*, agents(*)")
    .eq("id", callId)
    .eq("user_id", userId)
    .maybeSingle();
  if (callError) throw callError;
  if (!call || !call.agents) return null;

  const { data: messages, error: messageError } = await supabase
    .from("call_messages")
    .select("*")
    .eq("call_id", callId)
    .order("timestamp", { ascending: true });
  if (messageError) throw messageError;

  const transcript = (messages || []).map((message) => `${message.role}: ${message.content}`).join("\n");
  const analysis = await analyzeCallTranscript({
    transcript,
    agentPrompt: call.agents.system_prompt
  });

  await supabase.from("call_insights").upsert(insightFromAnalysis(analysis, callId, call.agent_id), {
    onConflict: "call_id"
  });

  const lead = analysis.lead || {};
  if (Object.keys(lead).length) {
    await supabase.from("extracted_leads").insert({
      call_id: callId,
      agent_id: call.agent_id,
      name: typeof lead.name === "string" ? lead.name : null,
      phone: typeof lead.phone === "string" ? lead.phone : call.phone_number,
      email: typeof lead.email === "string" ? lead.email : null,
      company: typeof lead.company === "string" ? lead.company : null,
      requirement: typeof lead.requirement === "string" ? lead.requirement : null,
      budget: typeof lead.budget === "string" ? lead.budget : null,
      timeline: typeof lead.timeline === "string" ? lead.timeline : null,
      status: "new",
      custom_fields: lead
    });
  }

  const suggestedLearnings = analysis.suggested_learnings || [];
  if (suggestedLearnings.length) {
    await supabase.from("agent_learning_events").insert(
      suggestedLearnings.map((learning) => ({
        agent_id: call.agent_id,
        source_call_id: callId,
        suggested_learning: typeof learning === "string" ? learning : learning.content || "",
        reason: typeof learning === "string" ? null : learning.reason || null,
        confidence_score: typeof learning === "string" ? null : learning.confidence || null,
        status: "pending"
      }))
    );
  }

  const unanswered = analysis.unanswered_questions || [];
  if (unanswered.length) {
    await supabase.from("unanswered_questions").insert(
      unanswered.map((question) => ({
        call_id: callId,
        agent_id: call.agent_id,
        question: typeof question === "string" ? question : question.question || "",
        attempted_answer: typeof question === "string" ? null : question.attempted_answer || null,
        reason_failed: typeof question === "string" ? null : question.reason_failed || null,
        status: "open"
      }))
    );
  }

  await supabase
    .from("calls")
    .update({
      summary: analysis.summary || call.summary
    })
    .eq("id", callId);

  return analysis;
}

export async function handleVobizStatusWebhook(request: Request) {
  const supabase = createSupabaseAdminClient();
  const event = await vobizProvider.handleWebhook(request);
  if (!supabase) return { event, updated: false };

  if (!event.callId && event.direction === "inbound" && event.agentId && event.phoneNumber) {
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, user_id")
      .eq("id", event.agentId)
      .maybeSingle();
    if (agentError) throw agentError;

    if (agent) {
      const roomName = event.livekitRoomName || liveKitRoomName(crypto.randomUUID());
      await ensureLiveKitRoom({
        roomName,
        metadata: {
          agentId: event.agentId,
          providerCallId: event.providerCallId,
          direction: "inbound"
        }
      });

      const { data: inboundCall, error: inboundError } = await supabase
        .from("calls")
        .insert({
          user_id: agent.user_id,
          agent_id: event.agentId,
          phone_number: event.phoneNumber,
          direction: "inbound",
          status: statusFromVobiz(event.status),
          livekit_room_name: roomName,
          vobiz_call_id: event.providerCallId || null,
          started_at: new Date().toISOString(),
          recording_url: event.recordingUrl || null
        })
        .select("*")
        .single();
      if (inboundError) throw inboundError;

      return { event, updated: true, created: true, call: inboundCall as Call };
    }
  }

  const update: Record<string, unknown> = {};
  if (event.status) update.status = statusFromVobiz(event.status);
  if (event.recordingUrl) update.recording_url = event.recordingUrl;
  if (event.providerCallId) update.vobiz_call_id = event.providerCallId;
  if (update.status === "completed") update.ended_at = new Date().toISOString();

  if (!Object.keys(update).length) return { event, updated: false };

  let query = supabase.from("calls").update(update).select("*");
  if (event.callId) {
    query = query.eq("id", event.callId);
  } else if (event.providerCallId) {
    query = query.eq("vobiz_call_id", event.providerCallId);
  } else {
    return { event, updated: false };
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;

  if (data?.status === "completed" && data.user_id) {
    await runPostCallAnalysis(data.user_id, data.id).catch(() => null);
  }

  return { event, updated: Boolean(data), call: data as Call | null };
}
