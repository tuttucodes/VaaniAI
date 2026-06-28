import type { AgentInput, AgentPatchInput } from "@/lib/validation";

export function toAgentInsert(input: AgentInput, userId: string) {
  return {
    user_id: userId,
    name: input.name,
    description: input.description || null,
    system_prompt: input.system_prompt,
    first_message: input.first_message || null,
    language: input.language,
    voice_id: input.voice_id,
    model_config: {
      model: input.cost_mode === "quality" ? "gemini-2.0-flash" : "gemini-2.0-flash",
      temperature: input.temperature,
      maxCallDurationSeconds: input.max_call_duration_seconds,
      silenceTimeoutMs: input.silence_timeout_ms,
      interruptionEnabled: input.interruption_enabled,
      knowledgeRetrievalEnabled: input.knowledge_retrieval_enabled,
      humanFillersEnabled: input.human_fillers_enabled,
      endCallRules: input.end_call_rules || ""
    },
    latency_config: {
      mode: input.latency_mode,
      targetPerceivedLatencyMs: input.latency_mode === "ultra-low" ? 300 : input.latency_mode === "balanced" ? 550 : 900,
      partialTranscriptPrefetch: input.latency_mode !== "quality",
      phraseLevelTts: true,
      endpointingMs: input.latency_mode === "ultra-low" ? 240 : 420
    },
    cost_config: {
      mode: input.cost_mode,
      maxEstimatedInrPerMinute: input.cost_mode === "economy" ? 2.2 : input.cost_mode === "balanced" ? 3 : 5,
      recentTurns: input.cost_mode === "economy" ? 4 : 8,
      maxRagChunks: input.cost_mode === "quality" ? 5 : 3
    },
    vobiz_config: {
      phoneNumber: input.vobiz_phone_number || "",
      sipConfig: input.vobiz_sip_config || ""
    }
  };
}

export function toAgentPatch(input: AgentPatchInput) {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };

  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description || null;
  if (input.system_prompt !== undefined) patch.system_prompt = input.system_prompt;
  if (input.first_message !== undefined) patch.first_message = input.first_message || null;
  if (input.language !== undefined) patch.language = input.language;
  if (input.voice_id !== undefined) patch.voice_id = input.voice_id;

  const touchesRuntime =
    input.temperature !== undefined ||
    input.max_call_duration_seconds !== undefined ||
    input.silence_timeout_ms !== undefined ||
    input.interruption_enabled !== undefined ||
    input.knowledge_retrieval_enabled !== undefined ||
    input.human_fillers_enabled !== undefined ||
    input.end_call_rules !== undefined ||
    input.latency_mode !== undefined ||
    input.cost_mode !== undefined ||
    input.vobiz_phone_number !== undefined ||
    input.vobiz_sip_config !== undefined;

  if (touchesRuntime) {
    const merged = toAgentInsert(
      {
        name: input.name || "Agent",
        description: input.description || null,
        system_prompt: input.system_prompt || "You are a concise AI voice assistant.",
        first_message: input.first_message || null,
        language: input.language || "multilingual-IN",
        voice_id: input.voice_id || "gemini-natural-female",
        temperature: input.temperature ?? 0.4,
        max_call_duration_seconds: input.max_call_duration_seconds ?? 600,
        silence_timeout_ms: input.silence_timeout_ms ?? 900,
        interruption_enabled: input.interruption_enabled ?? true,
        vobiz_phone_number: input.vobiz_phone_number || null,
        vobiz_sip_config: input.vobiz_sip_config || null,
        cost_mode: input.cost_mode || "economy",
        latency_mode: input.latency_mode || "ultra-low",
        knowledge_retrieval_enabled: input.knowledge_retrieval_enabled ?? true,
        human_fillers_enabled: input.human_fillers_enabled ?? true,
        end_call_rules: input.end_call_rules || null
      },
      "unused"
    );
    patch.model_config = merged.model_config;
    patch.latency_config = merged.latency_config;
    patch.cost_config = merged.cost_config;
    patch.vobiz_config = merged.vobiz_config;
  }

  return patch;
}
