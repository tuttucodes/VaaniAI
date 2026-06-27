import { embedText } from "@/lib/ai/gemini";
import { demoAgent } from "@/lib/demo-data";
import { isDemoMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { AgentKnowledgeChunk } from "@/lib/types";

const retrievalCache = new Map<string, { expiresAt: number; chunks: AgentKnowledgeChunk[]; latencyMs: number }>();

function cacheKey(agentId: string, query: string, topK: number) {
  return `${agentId}:${topK}:${query.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 240)}`;
}

export async function retrieveRelevantKnowledge({
  agentId,
  query,
  topK = 4
}: {
  agentId: string;
  query: string;
  topK?: number;
}) {
  const startedAt = performance.now();
  const key = cacheKey(agentId, query, topK);
  const cached = retrievalCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return {
      chunks: cached.chunks,
      latencyMs: cached.latencyMs,
      cached: true
    };
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase && isDemoMode()) {
    const latencyMs = Math.round(performance.now() - startedAt);
    const chunks: AgentKnowledgeChunk[] = [
      {
        id: "demo-knowledge",
        agent_id: demoAgent.id,
        file_id: "demo-file",
        content:
          "Demo knowledge: Vaani AI Voice supports LiveKit room creation, Vobiz telephony adapters, Gemini LLM calls, document upload, RAG, call insights, lead extraction, and memory approvals.",
        summary: "Vaani AI Voice MVP capabilities.",
        keywords: ["livekit", "vobiz", "gemini", "rag", "lead"],
        token_count: 42,
        source_reference: "Demo knowledge"
      }
    ];
    return { chunks, latencyMs, cached: false };
  }
  if (!supabase) throw new Error("Supabase is not configured. RAG retrieval requires Supabase outside demo mode.");

  const embedding = await embedText(query, "RETRIEVAL_QUERY");
  const { data, error } = await supabase.rpc("match_agent_knowledge", {
    p_agent_id: agentId,
    p_query_embedding: embedding,
    p_query_text: query,
    p_match_count: topK
  });

  if (error) throw error;

  const chunks = (data || []) as AgentKnowledgeChunk[];
  const latencyMs = Math.round(performance.now() - startedAt);
  retrievalCache.set(key, {
    chunks,
    latencyMs,
    expiresAt: Date.now() + 60_000
  });

  return { chunks, latencyMs, cached: false };
}
