import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { generateGeminiText, transcribeGeminiPcm } from "@/lib/ai/gemini";
import { generateGoogleCloudTtsPcm8khz } from "@/lib/ai/google-cloud";
import { getDemoScenario, type DemoScenarioId } from "@/lib/public-demo/scenarios";
import { compactRetrievedContext } from "@/lib/rag/chunking";
import { retrieveRelevantKnowledge } from "@/lib/rag/retrieval";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { AgentKnowledgeChunk } from "@/lib/types";

type VobizStartEvent = {
  event: "start";
  start: {
    callId: string;
    streamId: string;
    mediaFormat?: {
      encoding?: string;
      sampleRate?: number;
    };
  };
};

type VobizMediaEvent = {
  event: "media";
  media?: {
    payload?: string;
  };
};

type VobizPlayedEvent = {
  event: "playedStream" | "clearedAudio";
  name?: string;
};

type HistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

type CallFacts = {
  confirmedName?: string;
  appointmentReason?: string;
  preferredTime?: string;
  callbackNumber?: string;
  consent?: "unknown" | "granted" | "declined";
  callerDone?: boolean;
};

type CallState = {
  callId: string;
  agentId: string;
  streamId: string;
  scenario: ReturnType<typeof getDemoScenario>;
  agentName: string;
  agentSystemPrompt: string;
  name: string;
  useCase: string;
  sampleRate: number;
  mediaEncoding: string;
  inSpeech: boolean;
  silenceFrames: number;
  speechFrames: number;
  candidateSpeechFrames: number;
  candidateBuffers: Buffer[];
  bargeInFrames: number;
  turnBuffers: Buffer[];
  processing: boolean;
  assistantAudioQueued: boolean;
  assistantProtectedUntil: number;
  closed: boolean;
  history: HistoryTurn[];
  callStartedAt: number;
  turnStartedAt: number;
  mediaFrames: number;
  maxRms: number;
  speechLikeFrames: number;
  processedTurns: number;
  firstAudioLatencyMs?: number;
  interruptionCount: number;
  detectedMediaEncoding: boolean;
  facts: CallFacts;
  transport: "vobiz" | "browser";
  liveSession?: GeminiLiveVobizSession;
};

const port = Number(process.env.PORT || process.env.VOBIZ_STREAM_PORT || 8080);
const phoneSampleRate = 8000;
const geminiLiveWsBase =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const streamEngine = process.env.VOBIZ_STREAM_ENGINE || "gemini-live";
const speechRmsThreshold = 0.011;
const bargeInRmsThreshold = 0.028;
const speechStartFrames = 10; // 200 ms of sustained voice before a turn starts.
const minSpeechFrames = 12; // 240 ms.
const bargeInSpeechFrames = 14; // 280 ms before clearing assistant audio.
const endSilenceFrames = 24; // 480 ms.
const maxUtteranceFrames = 900; // 18 seconds.
const liveStartVoiceMs = Number(process.env.VOBIZ_LIVE_START_VOICE_MS || 360);
const liveEndSilenceMs = Number(process.env.VOBIZ_LIVE_END_SILENCE_MS || 950);
const liveBaseSpeechRms = Number(process.env.VOBIZ_LIVE_SPEECH_RMS || 0.018);
const liveBaseBargeInRms = Number(process.env.VOBIZ_LIVE_BARGE_IN_RMS || 0.065);
const liveBargeInVoiceMs = Number(process.env.VOBIZ_LIVE_BARGE_IN_VOICE_MS || 560);

function isStartEvent(message: unknown): message is VobizStartEvent {
  return Boolean(
    message &&
      typeof message === "object" &&
      (message as { event?: unknown }).event === "start" &&
      typeof (message as { start?: { streamId?: unknown } }).start?.streamId === "string"
  );
}

function isMediaEvent(message: unknown): message is VobizMediaEvent {
  return Boolean(message && typeof message === "object" && (message as { event?: unknown }).event === "media");
}

function isPlayedEvent(message: unknown): message is VobizPlayedEvent {
  const event = message && typeof message === "object" ? (message as { event?: unknown }).event : "";
  return event === "playedStream" || event === "clearedAudio";
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function cleanText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function isGreetingOnly(text: string) {
  return /^(hi|hello|hey|helo|hallo|namaste|namaskaram|halo)[.!?\s]*$/i.test(text.trim());
}

function isUnclearShortTranscript(text: string) {
  const clean = text.trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (/^[₹$€£]?\s*\d+(?:[.,]\d+)?\s*[₹$€£]?$/.test(clean)) return true;
  if (clean.length <= 2) return true;
  if (words.length === 1 && /^(oh|uh|um|mm|hmm|huh|ah)$/i.test(clean)) return true;
  return false;
}

function callerNameForPrompt(state: CallState) {
  if (state.facts.confirmedName) return state.facts.confirmedName;
  if (state.scenario.id === "dental") return "unknown until the caller clearly says their name in this call";
  return state.name || "unknown";
}

function updateCallFactsFromTranscript(state: CallState, text: string) {
  if (!text.trim()) return;
  const normalized = cleanText(text);
  const lower = normalized.toLowerCase();

  const nameMatch =
    normalized.match(/\b(?:my name is|this is|i am|i'm)\s+([A-Za-z][A-Za-z .'-]{1,40})/i) ||
    normalized.match(/(?:ente|എന്റെ)\s+(?:peru|പേര്)\s+([A-Za-z\u0D00-\u0D7F][A-Za-z\u0D00-\u0D7F .'-]{1,40})/i) ||
    normalized.match(/([A-Za-z\u0D00-\u0D7F][A-Za-z\u0D00-\u0D7F .'-]{1,40})\s+(?:aanu|ആണ്)$/i);
  if (nameMatch?.[1]) {
    const candidate = cleanText(nameMatch[1]).replace(/[.?!,]+$/, "");
    if (candidate.length >= 2 && candidate.length <= 42) {
      state.facts.confirmedName = candidate;
      state.name = candidate;
    }
  }

  if (/\b(root canal|rct|whitening|cleaning|scaling|braces|aligners?|tooth pain|pain|swelling|fever)\b/i.test(normalized)) {
    state.facts.appointmentReason = normalized.slice(0, 120);
  }
  if (/\b(tomorrow|today|morning|evening|afternoon|\d{1,2}\s*(?:am|pm)|\d{1,2}:\d{2})\b/i.test(normalized)) {
    state.facts.preferredTime = normalized.slice(0, 120);
  }
  const phoneMatch = normalized.match(/(?:\+?91[\s-]?)?[6-9](?:[\s-]?\d){9}/);
  if (phoneMatch?.[0]) state.facts.callbackNumber = phoneMatch[0].replace(/\D/g, "").slice(-10);

  if (/\b(yes|yeah|sure|ok|okay|continue|go ahead|parayu|പറയൂ|samsarikkam|സംസാരിക്കാം)\b/i.test(lower)) {
    state.facts.consent = "granted";
  }
  if (/\b(no|not now|later|busy|wrong|did not|didn't|vend[a-z]*|വേണ്ട|pinne|പിന്നെ)\b/i.test(lower)) {
    state.facts.consent = state.facts.consent === "granted" ? state.facts.consent : "declined";
  }
  if (/\b(thank you|thanks|that's all|nothing else|no more|mathi|മതി|illa|ഇല്ല)\b/i.test(lower)) {
    state.facts.callerDone = true;
  }
}

function swap16(buffer: Buffer) {
  const output = Buffer.alloc(buffer.length);
  for (let offset = 0; offset + 1 < buffer.length; offset += 2) {
    output[offset] = buffer[offset + 1];
    output[offset + 1] = buffer[offset];
  }
  return output;
}

function resamplePcm16Mono(pcm: Buffer, inputRate: number, outputRate: number) {
  if (inputRate === outputRate) return pcm;

  const inputSamples = Math.floor(pcm.length / 2);
  const outputSamples = Math.max(1, Math.floor((inputSamples * outputRate) / inputRate));
  const output = Buffer.alloc(outputSamples * 2);
  const ratio = inputRate / outputRate;

  for (let outputIndex = 0; outputIndex < outputSamples; outputIndex += 1) {
    const inputIndex = Math.min(inputSamples - 1, Math.floor(outputIndex * ratio));
    output.writeInt16LE(pcm.readInt16LE(inputIndex * 2), outputIndex * 2);
  }

  return output;
}

function ulawByteToPcm16(value: number) {
  const ulaw = ~value & 0xff;
  const sign = ulaw & 0x80;
  const exponent = (ulaw >> 4) & 0x07;
  const mantissa = ulaw & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  return sign ? -sample : sample;
}

function mulawToPcm16Le(buffer: Buffer) {
  const output = Buffer.alloc(buffer.length * 2);
  for (let index = 0; index < buffer.length; index += 1) {
    output.writeInt16LE(ulawByteToPcm16(buffer[index]), index * 2);
  }
  return output;
}

function decodeInboundFrame(buffer: Buffer, state: CallState) {
  const encoding = state.mediaEncoding.toLowerCase();
  const looksMulaw = encoding.includes("mulaw") || encoding.includes("pcmu") || buffer.length === Math.floor(state.sampleRate * 0.02);
  if (looksMulaw) return { pcm: mulawToPcm16Le(buffer), detectedMulaw: true };
  if (encoding.includes("l16le") || encoding.includes("pcm16le") || encoding.includes("little")) {
    return { pcm: buffer, detectedMulaw: false };
  }
  return { pcm: swap16(buffer), detectedMulaw: false };
}

function pcm16SampleToMulaw(sample: number) {
  const bias = 0x84;
  const clip = 32635;
  let pcm = Math.max(-clip, Math.min(clip, sample));
  const sign = pcm < 0 ? 0x80 : 0;
  if (pcm < 0) pcm = -pcm;
  pcm += bias;

  let exponent = 7;
  for (let mask = 0x4000; (pcm & mask) === 0 && exponent > 0; mask >>= 1) {
    exponent -= 1;
  }

  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

function pcm16LeToMulaw(pcm: Buffer) {
  const samples = Math.floor(pcm.length / 2);
  const output = Buffer.alloc(samples);
  for (let index = 0; index < samples; index += 1) {
    output[index] = pcm16SampleToMulaw(pcm.readInt16LE(index * 2));
  }
  return output;
}

function rmsPcm16Le(pcm: Buffer) {
  const samples = Math.floor(pcm.length / 2);
  if (!samples) return 0;
  let sum = 0;
  for (let index = 0; index < samples; index += 1) {
    const value = pcm.readInt16LE(index * 2) / 32768;
    sum += value * value;
  }
  return Math.sqrt(sum / samples);
}

function sendPcm(ws: WebSocket, pcm: Buffer, sampleRate = phoneSampleRate, encoding = "audio/x-l16") {
  const useMulaw = encoding.toLowerCase().includes("mulaw") || encoding.toLowerCase().includes("pcmu");
  const outboundSampleRate = useMulaw ? phoneSampleRate : sampleRate;
  const chunkBytes = Math.max(160, Math.floor(outboundSampleRate * 2 * 0.02));
  const outbound = useMulaw ? pcm16LeToMulaw(pcm) : pcm;
  const outboundChunkBytes = useMulaw ? Math.floor(phoneSampleRate * 0.02) : chunkBytes;

  for (let offset = 0; offset < outbound.length; offset += outboundChunkBytes) {
    const chunk = outbound.subarray(offset, offset + outboundChunkBytes);
    sendJson(ws, {
      event: "playAudio",
      media: {
        contentType: useMulaw ? "audio/x-mulaw" : "audio/x-l16",
        sampleRate: outboundSampleRate,
        payload: chunk.toString("base64")
      }
    });
  }
}

async function getCallRuntime(callId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase || !callId) return null;
  const { data } = await supabase
    .from("calls")
    .select("agent_id, agents(name, system_prompt, first_message)")
    .eq("id", callId)
    .single();
  const agent = Array.isArray(data?.agents) ? data?.agents[0] : data?.agents;
  return {
    agentId: data?.agent_id || "",
    agentName: typeof agent?.name === "string" ? agent.name : "",
    systemPrompt: typeof agent?.system_prompt === "string" ? agent.system_prompt : "",
    firstMessage: typeof agent?.first_message === "string" ? agent.first_message : ""
  };
}

async function recordMessage(callId: string, agentId: string, role: "system" | "user" | "assistant", content: string, latencyMs = 0) {
  const supabase = createSupabaseAdminClient();
  const cleanContent = cleanText(content);
  if (!supabase || !callId || !agentId || !cleanContent) return;
  await supabase.from("call_messages").insert({
    call_id: callId,
    agent_id: agentId,
    role,
    content: cleanContent,
    latency_ms: Math.max(0, Math.round(latencyMs))
  });
}

async function markCallInProgress(callId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase || !callId) return;
  await supabase.from("calls").update({ status: "in_progress", started_at: new Date().toISOString() }).eq("id", callId);
}

async function completeStreamCall(state: CallState) {
  const supabase = createSupabaseAdminClient();
  if (!supabase || !state.callId) return;

  const endedAt = new Date();
  const startedAt = new Date(state.callStartedAt || state.turnStartedAt || Date.now());
  const durationSeconds = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  const estimatedCost = Number(((durationSeconds / 60) * 0.03).toFixed(4));

  await supabase
    .from("calls")
    .update({
      status: "completed",
      ended_at: endedAt.toISOString(),
      duration_seconds: durationSeconds,
      total_cost_estimate: estimatedCost,
      summary: `${state.transport === "browser" ? "Browser" : "Phone"} voice session completed. Turns: ${state.processedTurns}.`
    })
    .eq("id", state.callId);

  await supabase.from("call_metrics").insert({
    call_id: state.callId,
    speech_end_to_transcript_ms: 0,
    transcript_to_first_token_ms: 0,
    first_token_to_first_audio_ms: state.firstAudioLatencyMs || null,
    total_response_latency_ms: state.firstAudioLatencyMs || null,
    interruption_count: state.interruptionCount || 0,
    average_response_latency_ms: state.firstAudioLatencyMs || null,
    estimated_cost: estimatedCost
  });
}

async function getOpening(callId: string, messageId: string, fallback: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase || !callId || !messageId) return fallback;
  const { data } = await supabase
    .from("call_messages")
    .select("content")
    .eq("id", messageId)
    .eq("call_id", callId)
    .single();
  return data?.content || fallback;
}

function resetTurn(state: CallState) {
  state.inSpeech = false;
  state.silenceFrames = 0;
  state.speechFrames = 0;
  state.candidateSpeechFrames = 0;
  state.candidateBuffers = [];
  state.bargeInFrames = 0;
  state.turnBuffers = [];
  state.turnStartedAt = Date.now();
}

function buildReplyPrompt(state: CallState, transcript: string, knowledge: AgentKnowledgeChunk[] = []) {
  const recentHistory = state.history
    .slice(-6)
    .map((turn) => `${turn.role === "user" ? "Caller" : "Assistant"}: ${turn.content}`)
    .join("\n");
  const retrievedContext = compactRetrievedContext(knowledge).slice(0, 1600);
  const hasPriorAssistantTurn = state.history.some((turn) => turn.role === "assistant");

  return `${state.agentSystemPrompt || state.scenario.systemPrompt}

You are on a live phone call in India.
Agent name: ${state.agentName || state.scenario.agentName}
Caller name: ${callerNameForPrompt(state)}
Landing-page use case: ${state.useCase || "not provided"}

Conversation so far:
${recentHistory || "No prior caller turns."}

Relevant knowledge:
${retrievedContext || "No relevant uploaded knowledge. Use only the agent context and ask a clear follow-up if needed."}

Caller just said:
${transcript}

Reply as a realistic phone receptionist, using the proven school-coordinator call style:
Rules:
- Never reset the conversation. If the caller says "hello" after you already spoke, treat it as a check-in or weak audio, not a new call opening.
- Remember within this call what you already asked. Never ask the same thing twice unless the caller clearly did not answer.
- Acknowledge first, then answer or ask. Example: "Sure, I can help." Then one useful question.
- Keep it short, warm, and natural: one or two spoken sentences, usually 8 to 22 words.
- Ask only one question at a time.
- End every turn with a clear handoff, question, confirmation, or wait cue, then stop.
- Support English, Malayalam, Manglish, Tamil, Telugu, Kannada, Hindi, and mixed Indian speech naturally.
- If the caller uses Malayalam or Manglish, mirror simply and naturally in Malayalam/Manglish. If they use English, continue in natural Indian English.
- For non-English replies, prefer simple spoken words in English letters so phone TTS pronounces them cleanly.
- Output plain spoken sentences only: no markdown, bullets, numbered lists, headers, or symbols.
- The transcript can be noisy. If the caller's words are unclear or incoherent, ask them to repeat instead of guessing.
- ${hasPriorAssistantTurn ? "Do not repeat the opening greeting; answer the newest caller utterance directly." : "You may greet once if it fits."}
- Vary phrasing; do not repeat the same sentence across turns.
- Confirm important details.
- If unsure, ask a clear follow-up.
- Use uploaded knowledge only when relevant. Do not dump documents or invent missing facts.
- Do not mention internal systems or providers.
- Do not invent availability, price, or medical advice.`;
}

function buildLiveInstructions(state: CallState) {
  const lowerUseCase = state.useCase.toLowerCase();
  const isElectronicsOffer = /\b(myg|my g|electronics?|digital|mobile|phone|laptop|appliance|offer|exchange|emi)\b/i.test(
    state.useCase
  );
  const isDental = state.scenario.id === "dental";
  const electronicsPrompt =
    "You are Meera, a warm female customer-care specialist from myG Digital Electronics. You are calling about current offers and guidance for smartphones, laptops, tablets, TVs, accessories, kitchen appliances, home appliances, exchange, EMI, app/online purchase support, and service support. Help the caller choose a product category and route them to the nearest store or callback team. Use only safe public-level facts: myG sells digital products and appliances through Kerala/South India retail and online channels. Never invent exact discounts, stock, model availability, delivery eligibility, store count, store address, warranty terms, model specifications, RAM/storage variants, or launch details. Do not name a specific phone model or spec unless the caller already named it. For exact prices, stock, delivery, offers, specs, store location, or availability, say the store/callback team will confirm the latest details. For phone comparison, give practical buying criteria, not a fake verdict: Apple/iPhone for iOS ecosystem, video, resale, and long-term updates; Samsung Ultra for zoom camera, S Pen, Android flexibility, and display. Capture interest category, current phone, upgrade target, budget range, preferred brand, city/area, and callback or WhatsApp preference.";
  const dentalPrompt =
    "You are Maya, a kind female receptionist at Pearl Dental Care in Kochi. This is a gentle callback/follow-up style call, never urgent, pushy, annoyed, or forceful. The landing-page context may mention root canal, whitening, or appointment needs, but those are unverified background notes until the caller says them in this live call. Do not use the form name during dental calls; the caller name is unknown until they clearly say it. Start short and permission-first: 'Hi, Pearl Dental Care Kochi aanu, Maya aanu. Ippol samsarikkan pattumo?' Only after they agree, explain softly: 'Saramilla, oru callback request vannath kond aanu vilichath. Dental appointment related aano, atho general enquiry aano?' Speak like a real Kochi receptionist, not translated textbook Malayalam. Use simple Manglish/Malayalam: 'saramilla', 'parayu', 'manassilayi', 'oru minute', 'vedana undo?', 'neeru allenkil pani undo?', 'eth divasam convenient aanu?', 'peru onnu parayamo?', 'callback number muzhuvanayi parayamo?'. Ask one clinic question at a time. Appointment reason must come from the caller's words; switch if they correct you. If asked what services are available, say briefly: 'Cleaning, filling, root canal, whitening, braces consultation okke clinicil undu.' Then ask what they want to know. If asked about whitening, say: 'Whitening option doctor check cheythittu aanu correct aayi parayan pattuka. Consultation arrange cheyyatte?' Never invent price, duration, safety, suitability, exact slot, or medical advice. Never give dental diagnosis, never say safe, serious, fine, okay, or no problem. If there is no pain or no issue, say you are glad to hear that and ask whether they still want a routine follow-up. If they challenge why you called, apologize and ask permission to continue or call later. Never confirm an exact slot; say the clinic team will confirm. Before ending, ask if they need anything else. If they are done, close with thanks and confirmation that the clinic team will follow up. Never say 'bye', 'vekkunnu', or announce a hangup. Forbidden awkward phrases: 'request request', 'kure neram aayallo', 'clinic angane confirm cheyyum', 'enthu specifically help cheyyana'.";
  const scenarioPrompt = isElectronicsOffer ? electronicsPrompt : isDental ? dentalPrompt : state.agentSystemPrompt || state.scenario.systemPrompt;
  const forceLanguage = (process.env.VOBIZ_LIVE_FORCE_LANGUAGE || "").toLowerCase();
  const languageLine =
    forceLanguage === "ml" || forceLanguage === "malayalam"
      ? "Open in natural Kerala Malayalam and keep speaking Malayalam/Manglish unless the caller explicitly asks for another language. If the caller mixes English words, mirror that naturally without becoming formal."
      : state.scenario.id === "school" || isDental
      ? "Open in natural Kerala Malayalam. If the parent replies in English, Hindi, or mixed Malayalam-English, switch naturally and stay with their language."
      : "Listen for the caller's language and mirror it naturally. Support English, Malayalam, Manglish, Hindi, Tamil, Telugu, Kannada, and mixed Indian speech.";

  return `${scenarioPrompt}

You are on a live phone call in India.
Agent name: ${state.agentName || state.scenario.agentName}
Caller name or label: ${callerNameForPrompt(state)}
Reason/context for this call: ${state.useCase || state.scenario.subtitle}

Conversation style:
- ${languageLine}
- Be human, calm, warm, and concise. Never sound scripted, robotic, salesy, or like written text.
- Use clean, spoken grammar. Prefer "Enthaanu ariyan vendath?", "Eth divasam convenient aanu?", "Consultation arrange cheyyatte?" over literal translations.
- Never reveal or discuss the technology behind the call.
- Do not read a fixed greeting. Start naturally from the context, then listen.
- Stay in role as the business receptionist. Do not drift into casual friendship, chit-chat, or "what's new" questions.
- If the caller says they are only testing or just called, acknowledge briefly and guide back to the actual task with one useful question.
- Acknowledge first, then answer or ask one useful question. Ask only ONE question per turn.
- Speak one short sentence, then pause. Avoid long paragraphs.
- Keep most turns under 14 spoken words unless confirming details.
- Hard limit: answer in at most two short sentences, then stop. Do not add a second question.
- Memory rule: remember confirmed details inside this call, including name, symptoms, preferred time, phone number, language preference, and corrections. Do not ask for a confirmed detail again unless the caller changes it.
- For dental calls, the form name is not verified and must not be spoken. If the caller corrects a name, use only the corrected name from then on.
- Use natural micro-acknowledgements sparingly, like "okay", "sure", "mm-hmm", or "I understand", only when it fits the moment.
- Never repeat the same sentence if the caller says hello again. Treat that as a weak-audio check-in and continue the current task.
- If you did not clearly hear the caller, ask them to repeat just that part. Do not guess names, numbers, dates, fees, symptoms, or availability.
- For retail calls, never claim exact stock, exact delivery, exact store location, exact store count, exact discounts, or exact model availability. Say the store or callback team will confirm, then ask what they prefer.
- For retail product questions, qualify like a sales receptionist. Do not behave like a product catalogue. If asked for exact specs or the best model, ask the budget, brand preference, and use case, then offer a callback/store confirmation.
- Handle interruption naturally: stop your prior thought, answer the newest thing they said, and do not restart the call.
- If the caller interrupts, do not finish the old sentence. Acknowledge softly with "sorry, parayu" or "saramilla, parayu", then answer the interruption.
- For private or important details, confirm before sharing or acting.
- When collecting a phone number, date, or time, do not repeat after every digit or fragment. Silently wait for the caller to finish, then confirm the full detail once. If only a tiny fragment arrives, say only "ബാക്കി കൂടി പറയാമോ?" and wait.
- For dental calls, if the name or phone number transcript is garbled, mixed-language, or incomplete, ask again plainly. Do not infer "Rahul Babu" or any digits unless the caller clearly said the full detail.
- For dental calls, never assert that the caller had treatment, requested a call, or needs follow-up unless the caller has confirmed it in this call. Treat the use case as background, not verified truth.
- For dental calls, never lock onto root canal, whitening, or any treatment from context. The appointment reason must come from the caller's words in this call.
- For dental calls, if the caller asks about services, answer at public receptionist level only: cleaning, filling, root canal, whitening, braces consultation. Then ask one next question.
- For dental calls, if the caller asks about whitening, do not explain treatment details. Say the doctor/team can explain after checking, then offer consultation/callback.
- For dental calls, if the caller mentions a birthday, respond warmly in one phrase and gently return to the clinic task. Do not wander into casual party questions unless they ask.
- For dental calls, if the caller challenges why you called, stop the workflow and ask permission to continue.
- For dental calls, never sound annoyed, defensive, or transactional. Be gentle, apologetic when confused, and optional: the caller can continue now or take a later callback.
- For dental calls, do not end with "വെക്കുന്നു", "bye", or an abrupt hangup cue. First ask if they need anything else. If they are done, close warmly and briefly, for example "ശരി, ക്ലിനിക് ടീം കൺഫേം ചെയ്യാൻ വിളിക്കും. നന്ദി."
- Do not ask for phone number and symptoms in the same turn. Collect appointment timing first, then contact details, then symptoms if needed.
- Output only spoken words. No markdown, bullets, labels, brackets, symbols, or stage directions.`;
}

class GeminiLiveVobizSession {
  private geminiWs?: WebSocket;
  private ready = false;
  private closed = false;
  private callerBuffer = "";
  private assistantBuffer = "";
  private voicedMs = 0;
  private strongVoicedMs = 0;
  private silenceMs = 0;
  private userSpeaking = false;
  private responseActive = false;
  private firstAudio = false;
  private turnStartedAt = 0;
  private greetingProtectedUntil = 0;
  private idleTimer?: NodeJS.Timeout;
  private idleStrikes = 0;
  private noiseFloor = 0.006;

  constructor(
    private readonly ws: WebSocket,
    private readonly state: CallState
  ) {}

  connect() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is required for Gemini Live Vobiz stream.");

    const model = process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview";
    this.geminiWs = new WebSocket(`${geminiLiveWsBase}?key=${encodeURIComponent(apiKey)}`);

    this.geminiWs.on("open", () => {
      this.sendGemini({
        setup: {
          model: `models/${model}`,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: process.env.GEMINI_LIVE_VOICE || (this.state.scenario.id === "school" ? "Leda" : "Aoede")
                }
              },
              languageCode:
                process.env.GEMINI_LIVE_LANGUAGE_CODE ||
                (this.state.scenario.id === "school" || this.state.scenario.id === "dental" ? "ml-IN" : "en-IN")
            }
          },
          systemInstruction: { parts: [{ text: buildLiveInstructions(this.state) }] },
          realtimeInputConfig: {
            automaticActivityDetection: { disabled: true }
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
    });

    this.geminiWs.on("message", (raw) => this.handleGeminiMessage(raw));
    this.geminiWs.on("error", (error) => {
      const message = error instanceof Error ? error.message : "unknown Gemini Live error";
      console.warn("Gemini Live stream error", { callId: this.state.callId, streamId: this.state.streamId, message });
      void recordMessage(this.state.callId, this.state.agentId, "system", `Gemini Live error: ${message.slice(0, 500)}`);
    });
    this.geminiWs.on("close", (code, reason) => {
      if (!this.closed) {
        const text = reason?.toString?.() || "";
        console.warn("Gemini Live stream closed", { callId: this.state.callId, streamId: this.state.streamId, code, reason: text });
        void recordMessage(this.state.callId, this.state.agentId, "system", `Gemini Live closed: ${code} ${text}`.trim());
      }
    });
  }

  private buildOpeningInstruction() {
    if (this.state.scenario.id === "dental") {
      return "The phone call just connected. Start gently as Maya from Pearl Dental Care Kochi. Ask if it is okay to talk now. Do not use the caller's name. Do not mention root canal, whitening, symptoms, or callback request in the first line. One warm short line only, then wait.";
    }
    return `The phone call just connected. Start now as ${this.state.agentName || this.state.scenario.agentName}. Use this call context as background only, not as verified caller facts: ${this.state.useCase || this.state.scenario.subtitle}. Say one short natural opening line and wait.`;
  }

  handleAudioFrame(inboundLe: Buffer) {
    if (this.closed || !this.ready || this.geminiWs?.readyState !== WebSocket.OPEN) return;
    const frame =
      this.state.sampleRate === phoneSampleRate ? inboundLe : resamplePcm16Mono(inboundLe, this.state.sampleRate, phoneSampleRate);
    const frameMs = Math.max(1, Math.round((frame.length / 2 / phoneSampleRate) * 1000));
    const rms = rmsPcm16Le(frame);
    this.state.mediaFrames += 1;
    this.state.maxRms = Math.max(this.state.maxRms, rms);

    if (!this.userSpeaking && !this.responseActive) {
      this.noiseFloor = Math.min(0.014, Math.max(0.003, this.noiseFloor * 0.97 + rms * 0.03));
    }

    const speechThreshold = Math.max(liveBaseSpeechRms, this.noiseFloor * 3.2);
    const bargeThreshold = Math.max(liveBaseBargeInRms, speechThreshold * 1.7);
    const isVoice = rms >= speechThreshold;
    const isBargeVoice = rms >= bargeThreshold;

    if (isVoice) {
      this.state.speechLikeFrames += 1;
      this.voicedMs += frameMs;
      this.silenceMs = 0;
    } else {
      this.silenceMs += frameMs;
      if (this.silenceMs >= 180) this.voicedMs = 0;
    }
    if (isBargeVoice) {
      this.strongVoicedMs += frameMs;
    } else if (this.silenceMs >= 80) {
      this.strongVoicedMs = 0;
    }

    const greetingActive = Date.now() < this.greetingProtectedUntil;
    const enoughToStart = this.responseActive
      ? this.strongVoicedMs >= liveBargeInVoiceMs
      : this.voicedMs >= liveStartVoiceMs;

    if (!this.userSpeaking && !greetingActive && enoughToStart) {
      this.userSpeaking = true;
      this.idleStrikes = 0;
      this.clearIdleTimer();
      this.sendGemini({ realtimeInput: { activityStart: {} } });
      if (this.responseActive) {
        this.responseActive = false;
        this.clearQueuedAudio("live-barge-in");
      }
    }

    if (this.userSpeaking && this.silenceMs >= liveEndSilenceMs) {
      this.userSpeaking = false;
      this.strongVoicedMs = 0;
      this.turnStartedAt = Date.now();
      this.firstAudio = false;
      this.sendGemini({ realtimeInput: { activityEnd: {} } });
    }

    const pcm16k = resamplePcm16Mono(frame, phoneSampleRate, 16000);
    this.sendGemini({
      realtimeInput: { audio: { data: pcm16k.toString("base64"), mimeType: "audio/pcm;rate=16000" } }
    });
  }

  private handleGeminiMessage(raw: Buffer | ArrayBuffer | Buffer[]) {
    let event: any;
    try {
      event = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw));
    } catch {
      return;
    }

    if (event.setupComplete) {
      this.ready = true;
      this.responseActive = true;
      this.firstAudio = false;
      this.turnStartedAt = Date.now();
      this.greetingProtectedUntil = Date.now() + Number(process.env.VOBIZ_LIVE_GREETING_PROTECT_MS || 1800);
      this.sendGemini({
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [
                {
                  text: this.buildOpeningInstruction()
                }
              ]
            }
          ],
          turnComplete: true
        }
      });
      console.info("Gemini Live setup complete", {
        callId: this.state.callId,
        streamId: this.state.streamId,
        model: process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview",
        voice: process.env.GEMINI_LIVE_VOICE || (this.state.scenario.id === "school" ? "Leda" : "Aoede")
      });
      return;
    }

    const content = event.serverContent;
    if (!content) return;

    if (content.interrupted) {
      this.responseActive = false;
      this.clearQueuedAudio("gemini-interrupted");
      return;
    }

    if (content.inputTranscription?.text) this.callerBuffer += content.inputTranscription.text;
    if (content.outputTranscription?.text) this.assistantBuffer += content.outputTranscription.text;

    const parts = content.modelTurn?.parts || [];
    for (const part of parts) {
      const audio = part.inlineData?.data;
      if (!audio) continue;
      if (this.callerBuffer.trim()) {
        this.recordTurn("user", this.callerBuffer.trim());
        this.callerBuffer = "";
      }
      if (!this.responseActive) {
        this.responseActive = true;
        this.turnStartedAt = Date.now();
        this.firstAudio = false;
      }

      const pcm24k = Buffer.from(audio, "base64");
      const pcm8k = resamplePcm16Mono(pcm24k, 24000, phoneSampleRate);
      sendPcm(this.ws, pcm8k, phoneSampleRate, this.state.mediaEncoding);
      if (!this.firstAudio) {
        this.firstAudio = true;
        const latency = this.turnStartedAt ? Date.now() - this.turnStartedAt : 0;
        this.state.firstAudioLatencyMs ??= latency;
        void recordMessage(this.state.callId, this.state.agentId, "system", `Gemini Live first audio latency: ${latency} ms.`);
        if (this.state.transport === "browser") {
          sendJson(this.ws, { event: "latency", metric: "first_audio", latency_ms: latency });
        }
        console.info("Gemini Live first audio", { callId: this.state.callId, streamId: this.state.streamId, latencyMs: latency });
      }
    }

    if (content.turnComplete) {
      if (this.callerBuffer.trim()) {
        this.recordTurn("user", this.callerBuffer.trim());
        this.callerBuffer = "";
      }
      if (this.assistantBuffer.trim()) {
        this.recordTurn("assistant", this.assistantBuffer.trim());
        this.assistantBuffer = "";
      }
      this.greetingProtectedUntil = 0;
      this.responseActive = false;
      this.armIdleTimer();
    }
  }

  private recordTurn(role: "user" | "assistant", text: string) {
    const content = cleanText(text);
    if (!content) return;
    if (role === "assistant") this.state.history.push({ role: "assistant", content });
    if (role === "user") {
      updateCallFactsFromTranscript(this.state, content);
      this.state.history.push({ role: "user", content });
    }
    this.state.history = this.state.history.slice(-12);
    void recordMessage(
      this.state.callId,
      this.state.agentId,
      role,
      content,
      role === "assistant" && this.turnStartedAt ? Date.now() - this.turnStartedAt : 0
    );
    if (this.state.transport === "browser") {
      sendJson(this.ws, {
        event: "transcript",
        role,
        content,
        latency_ms: role === "assistant" && this.turnStartedAt ? Date.now() - this.turnStartedAt : 0
      });
    }
    console.info("Gemini Live transcript", { callId: this.state.callId, streamId: this.state.streamId, role, text: content });
  }

  private armIdleTimer() {
    this.clearIdleTimer();
    if (this.closed) return;
    this.idleTimer = setTimeout(() => this.handleIdle(), 14000);
  }

  private handleIdle() {
    this.idleTimer = undefined;
    if (this.closed || this.responseActive) return;
    this.idleStrikes += 1;
    this.responseActive = true;
    this.firstAudio = false;
    this.turnStartedAt = Date.now();
    const prompt =
      this.idleStrikes >= 2
        ? "The caller is still silent. In one short natural sentence, say you can call back later if this is not a good time, then wait."
        : "The caller has gone quiet. In one short natural sentence, gently check whether they are still on the line.";
    this.sendGemini({ clientContent: { turns: [{ role: "user", parts: [{ text: prompt }] }], turnComplete: true } });
  }

  private clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
  }

  private clearQueuedAudio(reason: string) {
    console.info("Vobiz clearAudio sent", { callId: this.state.callId, streamId: this.state.streamId, reason });
    if (reason.includes("barge")) this.state.interruptionCount += 1;
    sendJson(this.ws, { event: "clearAudio", streamId: this.state.streamId });
    void recordMessage(this.state.callId, this.state.agentId, "system", `Vobiz clearAudio sent: ${reason}.`);
  }

  private sendGemini(payload: unknown) {
    if (this.geminiWs?.readyState === WebSocket.OPEN) this.geminiWs.send(JSON.stringify(payload));
  }

  close() {
    this.closed = true;
    this.clearIdleTimer();
    if (this.geminiWs && this.geminiWs.readyState !== WebSocket.CLOSED) this.geminiWs.close();
  }
}

async function playText(ws: WebSocket, state: CallState, text: string) {
  if (state.closed || ws.readyState !== WebSocket.OPEN) return 0;
  const started = Date.now();
  const pcm = await generateGoogleCloudTtsPcm8khz({ text });
  if (state.closed || ws.readyState !== WebSocket.OPEN) return Date.now() - started;
  state.assistantAudioQueued = true;
  state.assistantProtectedUntil = Date.now() + 900;
  state.bargeInFrames = 0;
  sendPcm(ws, pcm, phoneSampleRate, state.mediaEncoding);
  sendJson(ws, { event: "checkpoint", streamId: state.streamId, name: `assistant-${Date.now()}` });
  return Date.now() - started;
}

async function tryPlayText(ws: WebSocket, state: CallState, text: string, label: string) {
  try {
    return await playText(ws, state, text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`Vobiz ${label} TTS failed`, { callId: state.callId, streamId: state.streamId, message });
    await recordMessage(state.callId, state.agentId, "system", `${label} TTS failed: ${message.slice(0, 500)}`);
    return null;
  }
}

async function processTurn(ws: WebSocket, state: CallState, pcm: Buffer) {
  if (state.closed || state.processing || pcm.length < 640) return;
  state.processing = true;
  state.processedTurns += 1;
  const started = Date.now();

  try {
    const transcript = cleanText(
      await transcribeGeminiPcm({
        pcm,
        sampleRate: phoneSampleRate,
        languageHint: "English, Malayalam, Manglish, Tamil, Telugu, Kannada, Hindi, or mixed South Indian speech"
      })
    );

    if (!transcript || transcript.toLowerCase() === "empty string") {
      await recordMessage(
        state.callId,
        state.agentId,
        "system",
        `Gemini STT returned no transcript for ${Math.round(pcm.length / 2 / phoneSampleRate * 1000)} ms of captured audio.`
      );
      state.processing = false;
      return;
    }

    await recordMessage(state.callId, state.agentId, "user", transcript);
    updateCallFactsFromTranscript(state, transcript);
    state.history.push({ role: "user", content: transcript });
    if (state.closed || ws.readyState !== WebSocket.OPEN) return;

    const repeatedGreeting = isGreetingOnly(transcript) && state.history.some((turn) => turn.role === "assistant");

    if (isUnclearShortTranscript(transcript)) {
      const clarification = "Sorry, I did not catch that clearly. Could you say that once more?";
      const ttsLatency = await playText(ws, state, clarification);
      if (state.closed || ws.readyState !== WebSocket.OPEN) return;
      await recordMessage(state.callId, state.agentId, "assistant", clarification, Date.now() - started);
      await recordMessage(state.callId, state.agentId, "system", `Unclear transcript clarification latency: ${Date.now() - started} ms, TTS: ${ttsLatency} ms.`);
      state.history.push({ role: "assistant", content: clarification });
      return;
    }

    let knowledge: AgentKnowledgeChunk[] = [];
    if (state.agentId && process.env.VOBIZ_STREAM_RAG_ENABLED === "true" && !repeatedGreeting) {
      const retrievalStarted = Date.now();
      try {
        const retrieval = await retrieveRelevantKnowledge({
          agentId: state.agentId,
          query: `${transcript}\n${state.history.slice(-4).map((turn) => turn.content).join("\n")}`,
          topK: 3
        });
        knowledge = retrieval.chunks;
        await recordMessage(
          state.callId,
          state.agentId,
          "system",
          `RAG retrieved ${knowledge.length} chunk(s) in ${Date.now() - retrievalStarted} ms${retrieval.cached ? " (cached)" : ""}.`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        await recordMessage(state.callId, state.agentId, "system", `RAG retrieval skipped: ${message.slice(0, 300)}`);
      }
    }
    if (state.closed || ws.readyState !== WebSocket.OPEN) return;

    const prompt = repeatedGreeting
      ? `${buildReplyPrompt(state, transcript, knowledge)}

The caller only said a greeting after the call had already started. Do not greet again. Briefly reassure them you are listening and ask the next relevant question from the current context.`
      : buildReplyPrompt(state, transcript, knowledge);

    const reply = cleanText(
      await generateGeminiText(
        [
          {
            role: "user",
            text: prompt
          }
        ],
        { model: process.env.GEMINI_CALL_MODEL || process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash", temperature: 0.38, maxOutputTokens: 90 }
      )
    );

    if (!reply) {
      state.processing = false;
      return;
    }
    if (state.closed || ws.readyState !== WebSocket.OPEN) return;

    const ttsLatency = await playText(ws, state, reply);
    if (state.closed || ws.readyState !== WebSocket.OPEN) return;
    await recordMessage(state.callId, state.agentId, "assistant", reply, Date.now() - started);
    await recordMessage(state.callId, state.agentId, "system", `Turn latency: ${Date.now() - started} ms, TTS: ${ttsLatency} ms.`);
    state.history.push({ role: "assistant", content: reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("Vobiz stream orchestration error", { callId: state.callId, streamId: state.streamId, message });
    await recordMessage(state.callId, state.agentId, "system", `Orchestration error: ${message}`);
    const fallback = "Sorry, I had a brief issue hearing that. Could you say that once more?";
    try {
      if (!state.closed && ws.readyState === WebSocket.OPEN) {
        await playText(ws, state, fallback);
        await recordMessage(state.callId, state.agentId, "assistant", fallback);
      }
    } catch {
      // If TTS also fails, the hangup webhook still records the failed state.
    }
  } finally {
    state.processing = false;
  }
}

async function handleAudioFrame(ws: WebSocket, state: CallState, inboundLe: Buffer) {
  const frame = state.sampleRate === phoneSampleRate ? inboundLe : resamplePcm16Mono(inboundLe, state.sampleRate, phoneSampleRate);
  const rms = rmsPcm16Le(frame);
  state.mediaFrames += 1;
  state.maxRms = Math.max(state.maxRms, rms);
  const isSpeechLike = rms > speechRmsThreshold;
  const isStrongSpeech = rms > bargeInRmsThreshold;

  if (state.assistantAudioQueued && Date.now() > state.assistantProtectedUntil && isStrongSpeech) {
    state.bargeInFrames += 1;
  } else if (!isStrongSpeech) {
    state.bargeInFrames = 0;
  }

  if (state.assistantAudioQueued && state.bargeInFrames >= bargeInSpeechFrames) {
    state.assistantAudioQueued = false;
    state.bargeInFrames = 0;
    state.interruptionCount += 1;
    console.info("Vobiz stream clearAudio sent for barge-in", {
      callId: state.callId,
      streamId: state.streamId,
      sustainedMs: bargeInSpeechFrames * 20
    });
    sendJson(ws, { event: "clearAudio", streamId: state.streamId });
    await recordMessage(state.callId, state.agentId, "system", `Barge-in accepted after ${bargeInSpeechFrames * 20} ms sustained caller speech.`);
  }

  if (isSpeechLike) {
    state.speechLikeFrames += 1;
    if (!state.inSpeech) {
      state.candidateSpeechFrames += 1;
      state.candidateBuffers.push(frame);
      if (state.candidateBuffers.length > speechStartFrames + 4) state.candidateBuffers.shift();
      if (state.candidateSpeechFrames < speechStartFrames) return;
      state.inSpeech = true;
      state.turnStartedAt = Date.now();
      state.turnBuffers = [...state.candidateBuffers];
      state.speechFrames = state.candidateSpeechFrames;
      state.silenceFrames = 0;
      state.candidateBuffers = [];
      state.candidateSpeechFrames = 0;
      return;
    }
    state.speechFrames += 1;
    state.silenceFrames = 0;
    state.turnBuffers.push(frame);
  } else if (state.inSpeech) {
    state.silenceFrames += 1;
    state.turnBuffers.push(frame);
  } else {
    state.candidateSpeechFrames = 0;
    state.candidateBuffers = [];
  }

  const reachedEnd = state.inSpeech && state.silenceFrames >= endSilenceFrames && state.speechFrames >= minSpeechFrames;
  const reachedMax = state.inSpeech && state.turnBuffers.length >= maxUtteranceFrames;
  if (reachedEnd || reachedMax) {
    const pcm = Buffer.concat(state.turnBuffers);
    resetTurn(state);
    void processTurn(ws, state, pcm);
  }
}

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, worker: "vobiz-stream-agent", mode: streamEngine }));
    return;
  }

  response.writeHead(404);
  response.end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, request) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  let callId = url.searchParams.get("call_id") || "";
  const transport = url.searchParams.get("transport") === "browser" ? "browser" : "vobiz";
  const scenario = getDemoScenario((url.searchParams.get("scenario") || "dental") as DemoScenarioId);
  const name = url.searchParams.get("name") || "there";
  const useCase = url.searchParams.get("use_case") || "";
  const openingMessageId = url.searchParams.get("opening_message_id") || "";
  let state: CallState | undefined;

  ws.on("message", async (raw) => {
    let message: unknown;
    try {
      message = JSON.parse(raw.toString()) as unknown;
    } catch (error) {
      console.warn("Ignoring non-JSON Vobiz stream frame", {
        callId,
        message: error instanceof Error ? error.message : "unknown parse error"
      });
      return;
    }

    if (isStartEvent(message)) {
      const streamId = message.start.streamId;
      callId ||= message.start.callId || "";
      const runtime = await getCallRuntime(callId);
      const agentId = runtime?.agentId || "";
      const sampleRate = message.start.mediaFormat?.sampleRate || phoneSampleRate;
      const mediaEncoding = message.start.mediaFormat?.encoding || (transport === "browser" ? "audio/x-l16le" : "audio/x-mulaw");
      state = {
        callId,
        agentId,
        streamId,
        scenario,
        agentName: runtime?.agentName || scenario.agentName,
        agentSystemPrompt: runtime?.systemPrompt || scenario.systemPrompt,
        name,
        useCase,
        sampleRate,
        mediaEncoding,
        inSpeech: false,
        silenceFrames: 0,
        speechFrames: 0,
        candidateSpeechFrames: 0,
        candidateBuffers: [],
        bargeInFrames: 0,
        turnBuffers: [],
        processing: false,
        assistantAudioQueued: false,
        assistantProtectedUntil: 0,
        closed: false,
        history: [],
        callStartedAt: Date.now(),
        turnStartedAt: Date.now(),
        mediaFrames: 0,
        maxRms: 0,
        speechLikeFrames: 0,
        processedTurns: 0,
        interruptionCount: 0,
        detectedMediaEncoding: false,
        facts: { consent: "unknown" },
        transport
      };

      void markCallInProgress(callId);
      await recordMessage(
        callId,
        agentId,
        "system",
        `${transport === "browser" ? "Browser" : "Vobiz"} stream started: ${streamId} at ${sampleRate} Hz (${mediaEncoding}). Engine=${streamEngine}.`
      );
      console.info("Voice stream started", { callId, streamId, sampleRate, mediaEncoding, agentId, transport });
      if (streamEngine !== "orchestrated") {
        try {
          state.liveSession = new GeminiLiveVobizSession(ws, state);
          state.liveSession.connect();
        } catch (error) {
          const messageText = error instanceof Error ? error.message : "unknown Gemini Live startup error";
          console.error("Gemini Live startup failed", { callId, streamId, message: messageText });
          await recordMessage(callId, agentId, "system", `Gemini Live startup failed: ${messageText}`);
          sendJson(ws, { event: "stop", streamId });
        }
      } else {
        const opening = await getOpening(callId, openingMessageId, runtime?.firstMessage || `Hi ${name}, how can I help?`);
        await tryPlayText(ws, state, opening, "Opening");
        state.history.push({ role: "assistant", content: opening });
      }
      return;
    }

    if (isPlayedEvent(message) && state) {
      if (message.event === "playedStream") state.assistantAudioQueued = false;
      if (message.event === "clearedAudio") state.assistantAudioQueued = false;
      return;
    }

    if (isMediaEvent(message) && message.media?.payload && state) {
      const inbound = Buffer.from(message.media.payload, "base64");
      const encoding = state.mediaEncoding.toLowerCase();
      const decoded = decodeInboundFrame(inbound, state);
      if (decoded.detectedMulaw && !encoding.includes("mulaw") && !encoding.includes("pcmu")) {
        state.mediaEncoding = "audio/x-mulaw";
        if (!state.detectedMediaEncoding) {
          state.detectedMediaEncoding = true;
          void recordMessage(
            state.callId,
            state.agentId,
            "system",
            `Auto-detected Vobiz PCMU media frames (${inbound.length} bytes at ${state.sampleRate} Hz); switched playback to audio/x-mulaw.`
          );
          console.info("Vobiz stream media auto-detected as PCMU", {
            callId: state.callId,
            streamId: state.streamId,
            payloadBytes: inbound.length,
            sampleRate: state.sampleRate
          });
        }
      }
      if (state.liveSession) {
        state.liveSession.handleAudioFrame(decoded.pcm);
      } else {
        await handleAudioFrame(ws, state, decoded.pcm);
      }
    }
  });

  ws.on("close", () => {
    if (state) state.closed = true;
    if (!state) return;
    state.liveSession?.close();
    console.info("Voice stream closed", {
      callId: state.callId,
      streamId: state.streamId,
      transport: state.transport,
      frames: state.mediaFrames,
      speechLikeFrames: state.speechLikeFrames,
      maxRms: Number(state.maxRms.toFixed(4)),
      processedTurns: state.processedTurns
    });
    void recordMessage(
      state.callId,
      state.agentId,
      "system",
      `${state.transport === "browser" ? "Browser" : "Vobiz"} stream closed. Frames=${state.mediaFrames}, speech_like=${state.speechLikeFrames}, max_rms=${state.maxRms.toFixed(4)}, processed_turns=${state.processedTurns}.`
    );
    void completeStreamCall(state);
  });
});

server.listen(port, () => {
  console.log(`Vobiz Gemini orchestration worker listening on :${port}`);
});
