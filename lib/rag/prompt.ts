import { compactRetrievedContext } from "@/lib/rag/chunking";
import type { Agent, AgentKnowledgeChunk, CallMessage } from "@/lib/types";

export function buildVoicePrompt({
  agent,
  history,
  knowledge,
  memory,
  userUtterance
}: {
  agent: Agent;
  history: CallMessage[];
  knowledge: AgentKnowledgeChunk[];
  memory: string[];
  userUtterance: string;
}) {
  const recentHistory = history
    .slice(-6)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n")
    .slice(-2400);

  const retrievedContext = compactRetrievedContext(knowledge);
  const approvedMemory = memory.slice(0, 6).join("\n").slice(0, 1200);

  const system = `${agent.system_prompt}

Conversation rules:
- Sound realistic, warm, and natural.
- Use short spoken phrases.
- Ask one question at a time.
- Confirm important details.
- If unsure, ask a clear follow-up.
- Do not hallucinate. If knowledge is missing, say what you need.
- Use human bridge phrases sparingly only when latency needs it.
- Adapt to English, Malayalam, Hindi, or mixed speech.

Approved memory:
${approvedMemory || "None"}

Relevant knowledge:
${retrievedContext || "No relevant uploaded knowledge."}`;

  return [
    {
      role: "user" as const,
      text: `${system}

Recent conversation:
${recentHistory || "No prior turns."}

Caller just said:
${userUtterance}

Reply as the voice agent. Keep it concise and spoken.`
    }
  ];
}
