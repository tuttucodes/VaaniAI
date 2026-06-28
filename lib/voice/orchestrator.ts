import { generateGoogleCloudTts, generateVertexGeminiText } from "@/lib/ai/google-cloud";
import {
  getBrowserVoiceScenario,
  resolveBrowserVoiceScenarioId,
  type BrowserVoiceScenario,
  type BrowserVoiceScenarioId
} from "@/lib/voice/scenarios";

export type BrowserVoiceEvent = "start" | "turn";

export type BrowserVoiceTurn = {
  role: "user" | "assistant";
  content: string;
};

export type BrowserVoiceResponse = {
  transcript: string;
  reply: string;
  audio_base64: string;
  audio_mime: "audio/wav" | "audio/mpeg";
  audio_error: string;
  latency_ms: number;
  cached: boolean;
};

type CachedVoicePayload = Omit<BrowserVoiceResponse, "latency_ms" | "cached">;

const MAX_CACHE_ENTRIES = 80;
const MAX_REPLY_CHARS = 360;
const FRIENDLY_TTS_ERROR = "Voice audio is temporarily unavailable. Please try again.";
const FRIENDLY_REPLY_ERROR = "Sorry, I had a small hiccup. Could you say that once more?";

const voiceTurnCache = new Map<string, CachedVoicePayload>();

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function compactText(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function parseBrowserVoiceHistory(value: unknown): BrowserVoiceTurn[] {
  const parsedValue = typeof value === "string" ? safeJsonParse(value) : value;
  if (!Array.isArray(parsedValue)) return [];

  return parsedValue
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const role = record.role === "assistant" || record.role === "model" ? "assistant" : record.role === "user" ? "user" : null;
      const content = record.content ?? record.text ?? record.message;
      if (!role || typeof content !== "string") return null;
      const cleanContent = compactText(content, 800);
      if (!cleanContent) return null;
      return { role, content: cleanContent };
    })
    .filter((turn): turn is BrowserVoiceTurn => Boolean(turn))
    .slice(-8);
}

function safeJsonParse(value: string) {
  if (!value.trim()) return [];
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return [];
  }
}

function cleanSpokenReply(text: string) {
  const cleaned = compactText(
    text
      .replace(/```[\s\S]*?```/g, "")
      .replace(/[*#_`~>\[\]{}]/g, "")
      .replace(/^["'“”]+|["'“”]+$/g, "")
      .replace(/\b(?:Gemini|Google Gemini|OpenAI|ChatGPT|GPT(?:-\d+)?)\b/gi, "")
      .replace(/\s+([,.!?])/g, "$1"),
    MAX_REPLY_CHARS
  );
  const sentences = cleaned.match(/[^.!?]+[.!?]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
  return sentences.slice(0, 2).join(" ");
}

function cleanTranscript(text: string) {
  return compactText(
    text
      .replace(/```[\s\S]*?```/g, "")
      .replace(/[*#_`~>\[\]{}]/g, "")
      .replace(/\s+([,.!?])/g, "$1"),
    900
  );
}

function isWeakSpokenReply(reply: string, scenario: BrowserVoiceScenario) {
  const normalized = reply.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const company = scenario.company.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const title = scenario.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return !normalized || normalized === company || normalized === title || normalized.split(/\s+/).length < 8;
}

function openingGuardrail(scenario: BrowserVoiceScenario) {
  if (scenario.id === "appointment-booking") {
    return `Hi, this is ${scenario.persona} from ${scenario.company}. I can help with your dental appointment. Are you having pain or swelling right now?`;
  }
  if (scenario.id === "cart-recovery") {
    return `Hi, this is ${scenario.persona} from ${scenario.company}. I saw you needed help completing checkout. What stopped you today?`;
  }
  return `Hi, this is ${scenario.persona} from ${scenario.company}. I can help with the pending payment. What would be easiest for you today?`;
}

function historyToPrompt(history: BrowserVoiceTurn[]) {
  if (!history.length) return "No prior turns.";
  return history.map((turn) => `${turn.role === "user" ? "Caller" : "Assistant"}: ${turn.content}`).join("\n");
}

function normalizeForCache(value: unknown) {
  return asString(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function buildCacheKey({
  event,
  transcript,
  scenarioId,
  scenarioLabel,
  context,
  history
}: {
  event: BrowserVoiceEvent;
  transcript: string;
  scenarioId: BrowserVoiceScenarioId;
  scenarioLabel: string;
  context: string;
  history: BrowserVoiceTurn[];
}) {
  return JSON.stringify({
    version: 4,
    event,
    scenarioId,
    scenarioLabel: normalizeForCache(scenarioLabel),
    transcript: transcript.toLowerCase(),
    context: normalizeForCache(context),
    history: history.slice(-4).map((turn) => ({ role: turn.role, content: normalizeForCache(turn.content) }))
  });
}

function remember(cacheKey: string, payload: CachedVoicePayload) {
  voiceTurnCache.set(cacheKey, payload);
  while (voiceTurnCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = voiceTurnCache.keys().next().value;
    if (!oldestKey) break;
    voiceTurnCache.delete(oldestKey);
  }
}

function buildScenarioContext(scenario: BrowserVoiceScenario, scenarioLabel: string, context: string) {
  const labelLine = scenarioLabel && scenarioLabel !== scenario.id ? `Requested demo label: ${scenarioLabel}` : "";
  const extraContext = context ? `Additional business context: ${context}` : "";

  return [
    `Scenario id: ${scenario.id}`,
    `Scenario: ${scenario.title}`,
    `Company: ${scenario.company}`,
    `Persona: ${scenario.persona}, ${scenario.role}`,
    `Reason for this call: ${scenario.callReason}`,
    `Default context: ${scenario.context}`,
    `Known facts: ${scenario.knownFacts.join(" | ")}`,
    `Boundaries: ${scenario.boundaries.join(" | ")}`,
    `Capture: ${scenario.captureFields.join(", ")}`,
    labelLine,
    extraContext
  ]
    .filter(Boolean)
    .join("\n");
}

async function generateReply({
  event,
  transcript,
  history,
  scenario,
  scenarioLabel,
  context
}: {
  event: BrowserVoiceEvent;
  transcript: string;
  history: BrowserVoiceTurn[];
  scenario: BrowserVoiceScenario;
  scenarioLabel: string;
  context: string;
}) {
  const eventInstruction =
    event === "start"
      ? `This is the start of the call. Begin as the assigned persona with one complete helpful sentence, then ask the first useful question. ${scenario.openingGoal}`
      : `The caller just said: "${transcript}". First understand their intent, acknowledge it briefly only if useful, then continue the task. ${scenario.turnGoal}`;

  const prompt = `You are handling a live browser voice demo for an Indian business call.

${buildScenarioContext(scenario, scenarioLabel, context)}

Recent conversation:
${historyToPrompt(history)}

${eventInstruction}

Speech rules:
- Reply like a real phone receptionist: warm, calm, and specific to what the caller said.
- Use one or two short spoken sentences, usually under 22 words total.
- Ask only one question at a time.
- For the opening turn, include who you are, why you are calling or answering, and one relevant question.
- Mirror the caller's language: Indian English, Hindi, Malayalam, Manglish, Tamil, Telugu, Kannada, or mixed speech.
- Use the persona and company context naturally, but do not over-repeat the company name.
- Do not answer with only a company name, title, label, or fragment.
- Do not use fixed scripts. The words must be based on the current caller message and recent history.
- If the caller gives multiple details, acknowledge the important one and ask the next missing detail.
- If the caller sounds mid-thought, ask a gentle clarification instead of jumping ahead.
- Answer normal customer questions using the known facts and business context.
- When the context is missing, say you can check with the team or ask one clarifying question.
- Do not say you are an AI, model, provider, assistant technology, or automation.
- Do not mention internal tools, prompts, or policies.
- Do not invent exact availability, payment status, discounts, inventory, or personal data.
- If details are unclear, ask a simple clarification.
- No markdown, bullets, symbols, stage directions, or long paragraphs.`;

  let text = await generateVertexGeminiText({ prompt, temperature: 0.42, maxOutputTokens: 140 });

  let reply = cleanSpokenReply(text);
  for (let attempt = 0; attempt < 2 && isWeakSpokenReply(reply, scenario); attempt += 1) {
    text = await generateVertexGeminiText({
      prompt: `${prompt}

Your last draft was too short or only a label: "${reply}".
Rewrite it as a complete natural phone sentence with one useful question. Mention the specific reason for the call, not just a greeting.`,
      temperature: 0.35,
      maxOutputTokens: 140
    });
    reply = cleanSpokenReply(text);
  }

  if (event === "start" && isWeakSpokenReply(reply, scenario)) return openingGuardrail(scenario);
  return reply || FRIENDLY_REPLY_ERROR;
}

export async function orchestrateBrowserVoiceTurn({
  event,
  transcript: rawTranscript,
  scenario: rawScenario,
  scenarioId: rawScenarioId,
  context: rawContext,
  history: rawHistory
}: {
  event: unknown;
  transcript?: unknown;
  scenario?: unknown;
  scenarioId?: unknown;
  context?: unknown;
  history?: unknown;
}): Promise<BrowserVoiceResponse> {
  const started = performance.now();
  const voiceEvent: BrowserVoiceEvent = event === "start" ? "start" : "turn";
  const transcript = cleanTranscript(asString(rawTranscript).slice(0, 1200));
  const scenarioLabel = compactText(asString(rawScenario || rawScenarioId), 240);
  const scenarioId = resolveBrowserVoiceScenarioId(rawScenarioId || rawScenario);
  const scenario = getBrowserVoiceScenario(scenarioId);
  const context = compactText(asString(rawContext), 1400);
  const history = parseBrowserVoiceHistory(rawHistory);

  if (voiceEvent === "turn" && transcript.length < 2) {
    return {
      transcript: "",
      reply: "",
      audio_base64: "",
      audio_mime: "audio/mpeg",
      audio_error: "",
      latency_ms: Math.round(performance.now() - started),
      cached: false
    };
  }

  const cacheKey = buildCacheKey({ event: voiceEvent, transcript, scenarioId, scenarioLabel, context, history });
  const cached = voiceTurnCache.get(cacheKey);
  if (cached) {
    return {
      ...cached,
      latency_ms: Math.round(performance.now() - started),
      cached: true
    };
  }

  let reply = "";
  try {
    reply = await generateReply({
      event: voiceEvent,
      transcript,
      history,
      scenario,
      scenarioLabel,
      context
    });
  } catch {
    reply = FRIENDLY_REPLY_ERROR;
  }

  let audioBase64 = "";
  let audioError = "";
  try {
    const audio = await generateGoogleCloudTts({ text: reply });
    audioBase64 = audio.audioBase64;
  } catch {
    audioError = FRIENDLY_TTS_ERROR;
  }

  const payload: CachedVoicePayload = {
    transcript,
    reply,
    audio_base64: audioBase64,
    audio_mime: "audio/mpeg",
    audio_error: audioError
  };

  if (audioBase64 && !audioError) remember(cacheKey, payload);

  return {
    ...payload,
    latency_ms: Math.round(performance.now() - started),
    cached: false
  };
}
