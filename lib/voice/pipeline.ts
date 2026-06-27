import { estimateLiveTurnCostInr, streamGeminiText } from "@/lib/ai/gemini";
import { getAgent, listCallMessages } from "@/lib/data";
import { buildVoicePrompt } from "@/lib/rag/prompt";
import { retrieveRelevantKnowledge } from "@/lib/rag/retrieval";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export interface VoiceTurnInput {
  userId: string;
  callId: string;
  agentId: string;
  transcript: string;
  isPartial?: boolean;
}

const partialPrefetch = new Map<string, Promise<Awaited<ReturnType<typeof retrieveRelevantKnowledge>>>>();

function countTokens(text: string) {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.25);
}

export async function prefetchForPartialTranscript(input: VoiceTurnInput) {
  if (!input.transcript.trim() || input.transcript.length < 12) return null;
  const key = `${input.callId}:${input.transcript.toLowerCase().slice(0, 120)}`;
  if (!partialPrefetch.has(key)) {
    partialPrefetch.set(
      key,
      retrieveRelevantKnowledge({
        agentId: input.agentId,
        query: input.transcript,
        topK: 4
      })
    );
  }

  return partialPrefetch.get(key) || null;
}

export async function handleFinalTranscript(input: VoiceTurnInput) {
  const startedAt = performance.now();
  const supabase = createSupabaseAdminClient();
  const agent = await getAgent(input.userId, input.agentId);
  if (!agent) throw new Error("Agent not found");

  const history = await listCallMessages(input.userId, input.callId);
  const retrieval = await retrieveRelevantKnowledge({
    agentId: input.agentId,
    query: input.transcript,
    topK: Number(agent.cost_config?.maxRagChunks || 4)
  });

  const memoryRows = supabase
    ? await supabase
        .from("agent_memory")
        .select("content")
        .eq("agent_id", input.agentId)
        .eq("approved_by_user", true)
        .order("created_at", { ascending: false })
        .limit(8)
    : { data: [], error: null };

  if (memoryRows.error) throw memoryRows.error;

  const memory = (memoryRows.data || []).map((row) => String(row.content));
  const prompt = buildVoicePrompt({
    agent,
    history,
    knowledge: retrieval.chunks,
    memory,
    userUtterance: input.transcript
  });

  let firstTokenMs = 0;
  let assistantText = "";
  const inputTokens = countTokens(prompt.map((message) => message.text).join("\n"));

  for await (const token of streamGeminiText(prompt, {
    temperature: Number(agent.model_config?.temperature || 0.35),
    maxOutputTokens: 220
  })) {
    if (!firstTokenMs) firstTokenMs = Math.round(performance.now() - startedAt);
    assistantText += token;
  }

  assistantText = assistantText.trim();
  const totalLatencyMs = Math.round(performance.now() - startedAt);
  const outputTokens = countTokens(assistantText);
  const costMode = String(agent.cost_config?.mode || "economy");
  const estimatedCost = estimateLiveTurnCostInr({
    inputTokens,
    outputTokens,
    audioSeconds: Math.max(2, assistantText.length / 14),
    mode: costMode
  });

  if (supabase) {
    const { data: userMessage, error: userMessageError } = await supabase
      .from("call_messages")
      .insert({
        call_id: input.callId,
        agent_id: input.agentId,
        role: "user",
        content: input.transcript,
        latency_ms: 0
      })
      .select("*")
      .single();
    if (userMessageError) throw userMessageError;

    const { data: assistantMessage, error: assistantMessageError } = await supabase
      .from("call_messages")
      .insert({
        call_id: input.callId,
        agent_id: input.agentId,
        role: "assistant",
        content: assistantText,
        latency_ms: totalLatencyMs
      })
      .select("*")
      .single();
    if (assistantMessageError) throw assistantMessageError;

    if (retrieval.chunks.length) {
      await supabase.from("call_references").insert(
        retrieval.chunks.map((chunk) => ({
          call_id: input.callId,
          agent_id: input.agentId,
          knowledge_chunk_id: chunk.id,
          message_id: assistantMessage.id,
          relevance_score: chunk.similarity || 0
        }))
      );
    }

    await supabase.from("call_metrics").insert({
      call_id: input.callId,
      speech_end_to_transcript_ms: 0,
      transcript_to_first_token_ms: firstTokenMs,
      first_token_to_first_audio_ms: 0,
      rag_retrieval_ms: retrieval.latencyMs,
      total_response_latency_ms: totalLatencyMs,
      average_response_latency_ms: totalLatencyMs,
      estimated_cost: estimatedCost
    });

    if (!retrieval.chunks.length && /\?$/.test(input.transcript.trim())) {
      await supabase.from("unanswered_questions").insert({
        call_id: input.callId,
        agent_id: input.agentId,
        question: input.transcript,
        attempted_answer: assistantText,
        reason_failed: "No relevant uploaded knowledge chunk was retrieved.",
        status: "open"
      });
    }

    return {
      userMessage,
      assistantMessage,
      assistantText,
      retrieval,
      totalLatencyMs,
      firstTokenMs,
      estimatedCost
    };
  }

  return {
    userMessage: null,
    assistantMessage: null,
    assistantText,
    retrieval,
    totalLatencyMs,
    firstTokenMs,
    estimatedCost
  };
}
