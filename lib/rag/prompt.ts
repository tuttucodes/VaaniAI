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
- Keep responses short: one or two spoken sentences, usually 10 to 25 words.
- Ask one question at a time.
- End every turn with a clear handoff, question, confirmation, or wait cue.
- Confirm important details.
- If unsure, ask a clear follow-up.
- Do not hallucinate. If knowledge is missing, say what you need.
- Use human bridge phrases sparingly only when latency needs it.
- Adapt to English, Malayalam, Tamil, Telugu, Kannada, Hindi, or mixed Indian speech.
- If the caller uses Malayalam/Manglish or another South Indian language, mirror simply and naturally; do not force pure English.
- For non-English replies, prefer simple spoken words in English letters so phone TTS pronounces them cleanly.
- Output plain spoken sentences only. No markdown, bullets, numbered lists, headers, or symbols.
- Audio transcripts can be noisy. If a caller message does not make sense, ask them to repeat instead of guessing.
- Use relevant uploaded knowledge precisely, but never read long chunks aloud.
- If retrieved knowledge conflicts with the agent prompt or is not relevant, ignore it and ask a follow-up.

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
