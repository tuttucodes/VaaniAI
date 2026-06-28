import { getEnv, isDemoMode, isGeminiConfigured, requireEnv } from "@/lib/env";
import type { CallInsight } from "@/lib/types";

export interface GeminiChatMessage {
  role: "user" | "model";
  text: string;
}

export interface GeminiGenerationOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_CHAT_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_STT_MODEL = "gemini-2.5-flash";
const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-2";
const DEFAULT_TTS_MODEL = "gemini-2.5-flash-preview-tts";
const DEFAULT_TTS_VOICE = "Achird";
const EMBEDDING_DIMENSION = 768;
const GEMINI_TTS_SAMPLE_RATE = 24000;
const PHONE_TTS_SAMPLE_RATE = 8000;

export function getChatModel() {
  return getEnv("GEMINI_CHAT_MODEL") || DEFAULT_CHAT_MODEL;
}

function uniqueModels(models: string[]) {
  return Array.from(new Set(models.filter(Boolean)));
}

export function getEmbeddingModel() {
  return getEnv("GEMINI_EMBEDDING_MODEL") || DEFAULT_EMBEDDING_MODEL;
}

export function getSttModel() {
  return getEnv("GEMINI_STT_MODEL") || DEFAULT_STT_MODEL;
}

export function getTtsModel() {
  return getEnv("GEMINI_TTS_MODEL") || DEFAULT_TTS_MODEL;
}

export function getTtsVoice() {
  return getEnv("GEMINI_TTS_VOICE") || DEFAULT_TTS_VOICE;
}

export function isGeminiTtsEnabled() {
  const value = getEnv("GEMINI_TTS_ENABLED");
  if (value === "false") return false;
  if (value === "true") return true;
  return isGeminiConfigured();
}

function deterministicEmbedding(text: string) {
  const vector = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  for (let index = 0; index < text.length; index += 1) {
    const bucket = (text.charCodeAt(index) * 31 + index * 17) % EMBEDDING_DIMENSION;
    vector[bucket] += ((text.charCodeAt(index) % 23) - 11) / 11;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / norm).toFixed(8)));
}

export async function embedText(text: string, taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" = "RETRIEVAL_QUERY") {
  const cleanText = text.slice(0, 8000);
  const model = getEmbeddingModel();
  const isEmbedding2 = model === "gemini-embedding-2";
  const taskPrefix =
    taskType === "RETRIEVAL_QUERY"
      ? "task: question answering | query:"
      : "title: uploaded knowledge | text:";
  const embeddingText = isEmbedding2 ? `${taskPrefix} ${cleanText}` : cleanText;

  if (!isGeminiConfigured() && isDemoMode()) {
    return deterministicEmbedding(embeddingText);
  }
  if (!isGeminiConfigured()) throw new Error("GEMINI_API_KEY is required outside demo mode.");

  const response = await fetch(`${GEMINI_API_BASE}/models/${model}:embedContent?key=${requireEnv("GEMINI_API_KEY")}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(
      isEmbedding2
        ? {
            content: {
              parts: [{ text: embeddingText }]
            },
            output_dimensionality: EMBEDDING_DIMENSION
          }
        : {
            taskType,
            content: {
              parts: [{ text: cleanText }]
            },
            output_dimensionality: EMBEDDING_DIMENSION
          }
    )
  });

  if (!response.ok) {
    throw new Error(`Gemini embedding failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { embedding?: { values?: number[] }; embeddings?: Array<{ values?: number[] }> };
  const values = data.embedding?.values || data.embeddings?.[0]?.values;
  if (!values?.length) {
    throw new Error("Gemini embedding response did not include values");
  }

  return values;
}

function toGeminiContents(messages: GeminiChatMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    parts: [{ text: message.text }]
  }));
}

export async function generateGeminiText(messages: GeminiChatMessage[], options: GeminiGenerationOptions = {}) {
  if (!isGeminiConfigured() && isDemoMode()) {
    const lastUser = [...messages].reverse().find((message) => message.role === "user")?.text || "";
    return `Got it. Based on the current context, I would answer briefly and ask one clear follow-up. ${lastUser ? "Could you share one more detail?" : ""}`.trim();
  }
  if (!isGeminiConfigured()) throw new Error("GEMINI_API_KEY is required outside demo mode.");

  const models = options.model ? [options.model] : uniqueModels([getChatModel(), "gemini-2.5-flash", "gemini-flash-latest"]);
  let lastError = "";

  for (const model of models) {
    const response = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${requireEnv("GEMINI_API_KEY")}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        contents: toGeminiContents(messages),
        generationConfig: {
          temperature: options.temperature ?? 0.35,
          maxOutputTokens: options.maxOutputTokens ?? 512
        }
      })
    });

    if (!response.ok) {
      lastError = `Gemini generation failed for ${model}: ${response.status} ${await response.text()}`;
      continue;
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
    if (text) return text;
    lastError = `Gemini generation returned empty text for ${model}`;
  }

  throw new Error(lastError || "Gemini generation failed.");
}

function downsamplePcm16Mono(pcm: Buffer, inputSampleRate = GEMINI_TTS_SAMPLE_RATE, outputSampleRate = PHONE_TTS_SAMPLE_RATE) {
  if (inputSampleRate === outputSampleRate) return pcm;

  const inputSamples = Math.floor(pcm.length / 2);
  const outputSamples = Math.floor((inputSamples * outputSampleRate) / inputSampleRate);
  const output = Buffer.alloc(outputSamples * 2);
  const ratio = inputSampleRate / outputSampleRate;

  for (let outputIndex = 0; outputIndex < outputSamples; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.max(start + 1, Math.floor((outputIndex + 1) * ratio));
    let sum = 0;
    let count = 0;

    for (let inputIndex = start; inputIndex < end && inputIndex < inputSamples; inputIndex += 1) {
      sum += pcm.readInt16LE(inputIndex * 2);
      count += 1;
    }

    output.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sum / Math.max(1, count)))), outputIndex * 2);
  }

  return output;
}

function pcmToWav(pcm: Buffer, sampleRate = PHONE_TTS_SAMPLE_RATE) {
  const header = Buffer.alloc(44);
  const dataSize = pcm.length;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

export async function transcribeGeminiPcm({
  pcm,
  sampleRate = PHONE_TTS_SAMPLE_RATE,
  languageHint = "English, Hindi, Malayalam, or mixed Indian speech"
}: {
  pcm: Buffer;
  sampleRate?: number;
  languageHint?: string;
}) {
  if (!isGeminiConfigured()) throw new Error("GEMINI_API_KEY is required for Gemini STT.");
  if (!pcm.length) return "";

  const wav = pcmToWav(pcm, sampleRate);
  const response = await fetch(`${GEMINI_API_BASE}/models/${getSttModel()}:generateContent?key=${requireEnv("GEMINI_API_KEY")}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Transcribe this phone-call audio. Language may be ${languageHint}. Return only the spoken words. If there is no clear speech, return an empty string.`
            },
            {
              inlineData: {
                mimeType: "audio/wav",
                data: wav.toString("base64")
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 320
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini STT failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
  return text
    .replace(/^```[\s\S]*?\n?/, "")
    .replace(/```$/g, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
}

export async function generateGeminiTtsWav({
  text,
  voice = getTtsVoice(),
  model = getTtsModel()
}: {
  text: string;
  voice?: string;
  model?: string;
}) {
  const pcm = await generateGeminiTtsPcm8khz({ text, voice, model });
  return pcmToWav(pcm);
}

export async function generateGeminiTtsPcm8khz({
  text,
  voice = getTtsVoice(),
  model = getTtsModel()
}: {
  text: string;
  voice?: string;
  model?: string;
}) {
  if (!isGeminiConfigured()) throw new Error("GEMINI_API_KEY is required for Gemini TTS.");

  const response = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": requireEnv("GEMINI_API_KEY")
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Say: ${text}`
            }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice
            }
          }
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini TTS failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
  };
  const encoded = data.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData?.data;
  if (!encoded) throw new Error("Gemini TTS response did not include audio.");

  return downsamplePcm16Mono(Buffer.from(encoded, "base64"));
}

export async function* streamGeminiText(messages: GeminiChatMessage[], options: GeminiGenerationOptions = {}) {
  if (!isGeminiConfigured()) {
    const fallback = await generateGeminiText(messages, options);
    for (const token of fallback.split(/(\s+)/)) {
      yield token;
    }
    return;
  }

  const model = options.model || getChatModel();
  const response = await fetch(
    `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${requireEnv("GEMINI_API_KEY")}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        contents: toGeminiContents(messages),
        generationConfig: {
          temperature: options.temperature ?? 0.35,
          maxOutputTokens: options.maxOutputTokens ?? 512
        }
      })
    }
  );

  if (!response.ok || !response.body) {
    throw new Error(`Gemini streaming failed: ${response.status} ${await response.text()}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const event of events) {
      const line = event
        .split("\n")
        .find((entry) => entry.startsWith("data:"))
        ?.replace(/^data:\s*/, "");
      if (!line || line === "[DONE]") continue;

      const parsed = JSON.parse(line) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
      if (text) yield text;
    }
  }
}

export function splitIntoSpeakablePhrases(text: string) {
  const phrases = text
    .split(/(?<=[.!?])\s+|(?<=,)\s+/)
    .map((phrase) => phrase.trim())
    .filter(Boolean);

  if (phrases.length) return phrases;
  return text.trim() ? [text.trim()] : [];
}

export function shouldUseBridgePhrase(waitMs: number, fillersEnabled: boolean) {
  return fillersEnabled && waitMs > 220;
}

export function bridgePhrase(language: string) {
  if (language.toLowerCase().includes("hi")) return "Ek second.";
  if (language.toLowerCase().includes("ml")) return "Oru second.";
  return "One second.";
}

export function estimateLiveTurnCostInr({
  inputTokens,
  outputTokens,
  audioSeconds,
  mode
}: {
  inputTokens: number;
  outputTokens: number;
  audioSeconds: number;
  mode: string;
}) {
  const modelMultiplier = mode === "quality" ? 1.7 : mode === "balanced" ? 1.25 : 1;
  const tokenCost = ((inputTokens * 0.000012 + outputTokens * 0.00004) * modelMultiplier);
  const audioCost = (audioSeconds / 60) * (mode === "quality" ? 2.2 : mode === "balanced" ? 1.5 : 0.95);
  return Number((tokenCost + audioCost).toFixed(4));
}

export async function analyzeCallTranscript({
  transcript,
  agentPrompt
}: {
  transcript: string;
  agentPrompt: string;
}) {
  const prompt = `Analyze this completed AI voice call. Return strict JSON only with keys: summary, intent, sentiment, outcome, objections, questions, answers, follow_up_required, extracted_data, lead, suggested_learnings, unanswered_questions, performance_notes.

Agent prompt:
${agentPrompt}

Transcript:
${transcript}`;

  let text: string;
  try {
    text = await generateGeminiText(
      [
        {
          role: "user",
          text: prompt
        }
      ],
      { temperature: 0.1, maxOutputTokens: 1200 }
    );
  } catch (error) {
    return fallbackTranscriptAnalysis(transcript, error);
  }

  const jsonText = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();

  try {
    return JSON.parse(jsonText) as {
      summary?: string;
      intent?: string;
      sentiment?: string;
      outcome?: string;
      objections?: unknown[];
      questions?: unknown[];
      answers?: unknown[];
      follow_up_required?: boolean;
      extracted_data?: Record<string, unknown>;
      lead?: Record<string, unknown>;
      suggested_learnings?: Array<{ content?: string; reason?: string; confidence?: number } | string>;
      unanswered_questions?: Array<{ question?: string; attempted_answer?: string; reason_failed?: string } | string>;
      performance_notes?: string[];
    };
  } catch {
    return {
      summary: text.slice(0, 1000),
      intent: "unknown",
      sentiment: "unknown",
      outcome: "needs_review",
      objections: [],
      questions: [],
      answers: [],
      follow_up_required: false,
      extracted_data: {},
      suggested_learnings: [],
      unanswered_questions: []
    };
  }
}

function fallbackTranscriptAnalysis(transcript: string, error?: unknown) {
  const lower = transcript.toLowerCase();
  const phone = transcript.match(/(?:\+91[\s-]?)?\d[\d\s-]{8,}\d/)?.[0]?.replace(/\s+/g, " ").trim();
  const name = transcript.match(/(?:i am|i'm|my name is)\s+([a-z][a-z\s]{1,40})[.!,\n]/i)?.[1]?.trim();
  const hasAppointment = /\bappointment|slot|booking|book\b/i.test(transcript);
  const hasCallback = /\bcall me back|callback|call back\b/i.test(transcript);
  const hasDentalPain = /\btooth pain|sensitivity|bleeding|swelling|fever|dental\b/i.test(transcript);
  const timeline =
    transcript.match(/\btomorrow\s+(?:morning|afternoon|evening|after\s+\d+\s*(?:am|pm)?)\b/i)?.[0] ||
    transcript.match(/\bafter\s+\d+\s*(?:am|pm)?\b/i)?.[0] ||
    transcript.match(/\btomorrow\b/i)?.[0] ||
    transcript.match(/\b(today|evening|morning|afternoon)\b/i)?.[0];
  const quotaMessage = error instanceof Error ? error.message.slice(0, 180) : "Gemini analysis unavailable";

  return {
    summary: hasDentalPain
      ? "Caller requested dental help for tooth pain or sensitivity and asked the clinic to follow up for an appointment."
      : "Caller spoke with the receptionist and requested follow-up.",
    intent: hasAppointment ? "book_dental_appointment" : "general_dental_inquiry",
    sentiment: "neutral",
    outcome: hasCallback ? "callback_requested" : hasAppointment ? "appointment_requested" : "needs_review",
    objections: [],
    questions: [
      "Caller asked for appointment or follow-up timing.",
      "Receptionist checked for urgent symptoms."
    ],
    answers: [
      "Receptionist captured symptoms, preferred timing, and contact details.",
      "Receptionist avoided confirming an exact slot without clinic availability."
    ],
    follow_up_required: hasCallback || hasAppointment,
    extracted_data: {
      fallback_analysis: true,
      fallback_reason: quotaMessage,
      service: hasDentalPain ? "tooth pain / sensitivity" : "dental inquiry",
      preferred_time: timeline || null
    },
    lead: {
      name: name || null,
      phone: phone || null,
      email: null,
      company: null,
      requirement: hasDentalPain ? "Tooth pain / sensitivity appointment" : "Dental appointment inquiry",
      budget: null,
      timeline: timeline || null
    },
    suggested_learnings: [
      {
        content: "For tooth pain calls, ask about swelling, fever, bleeding, trauma, preferred appointment time, name, and callback number before ending.",
        reason: "Fallback analysis detected a common dental appointment triage pattern.",
        confidence: 0.72
      }
    ],
    unanswered_questions: [],
    performance_notes: ["Gemini post-call analysis fell back to heuristic extraction because provider generation was unavailable."]
  };
}

export function insightFromAnalysis(analysis: Awaited<ReturnType<typeof analyzeCallTranscript>>, callId: string, agentId: string) {
  return {
    call_id: callId,
    agent_id: agentId,
    intent: analysis.intent || null,
    sentiment: analysis.sentiment || null,
    outcome: analysis.outcome || null,
    objections: analysis.objections || [],
    questions: analysis.questions || [],
    answers: analysis.answers || [],
    follow_up_required: Boolean(analysis.follow_up_required),
    extracted_data: analysis.extracted_data || {}
  } satisfies Omit<CallInsight, "id" | "created_at">;
}
