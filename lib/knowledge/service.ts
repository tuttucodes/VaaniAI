import crypto from "node:crypto";
import { embedText } from "@/lib/ai/gemini";
import { parseKnowledgeFile } from "@/lib/documents/parser";
import { isDemoMode } from "@/lib/env";
import { createKnowledgeChunks } from "@/lib/rag/chunking";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { AgentKnowledgeFile } from "@/lib/types";

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 140);
}

function vectorLiteral(values: number[]) {
  return `[${values.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

export async function uploadKnowledgeFile({
  userId,
  agentId,
  file
}: {
  userId: string;
  agentId: string;
  file: File;
}) {
  const supabase = createSupabaseAdminClient();
  const parsed = await parseKnowledgeFile(file);
  const chunks = createKnowledgeChunks(parsed.sections);

  if (!supabase && isDemoMode()) {
    return {
      file: {
        id: crypto.randomUUID(),
        agent_id: agentId,
        user_id: userId,
        filename: file.name,
        file_type: parsed.fileType,
        storage_path: "demo/local",
        status: "ready",
        created_at: new Date().toISOString()
      } satisfies AgentKnowledgeFile,
      chunksCreated: chunks.length,
      demo: true
    };
  }
  if (!supabase) throw new Error("Supabase is not configured. Knowledge upload requires Supabase outside demo mode.");

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (agentError) throw agentError;
  if (!agent) throw new Error("Agent not found");

  const storagePath = `${userId}/${agentId}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage.from("agent-knowledge").upload(storagePath, buffer, {
    contentType: file.type || parsed.fileType,
    upsert: false
  });
  if (uploadError) throw uploadError;

  const { data: knowledgeFile, error: fileError } = await supabase
    .from("agent_knowledge_files")
    .insert({
      agent_id: agentId,
      user_id: userId,
      filename: file.name,
      file_type: parsed.fileType,
      storage_path: storagePath,
      status: "processing"
    })
    .select("*")
    .single();

  if (fileError) throw fileError;

  try {
    const rows = [];
    for (const chunk of chunks) {
      const embedding = await embedText(`${chunk.summary}\n${chunk.content}`, "RETRIEVAL_DOCUMENT");
      rows.push({
        agent_id: agentId,
        file_id: knowledgeFile.id,
        content: chunk.content,
        summary: chunk.summary,
        keywords: chunk.keywords,
        embedding: vectorLiteral(embedding),
        token_count: chunk.token_count,
        source_reference: chunk.source_reference
      });
    }

    for (let index = 0; index < rows.length; index += 50) {
      const { error } = await supabase.from("agent_knowledge_chunks").insert(rows.slice(index, index + 50));
      if (error) throw error;
    }

    const { data: readyFile, error: readyError } = await supabase
      .from("agent_knowledge_files")
      .update({ status: "ready" })
      .eq("id", knowledgeFile.id)
      .select("*")
      .single();
    if (readyError) throw readyError;

    return {
      file: readyFile as AgentKnowledgeFile,
      chunksCreated: rows.length,
      demo: false
    };
  } catch (error) {
    await supabase.from("agent_knowledge_files").update({ status: "failed" }).eq("id", knowledgeFile.id);
    throw error;
  }
}
