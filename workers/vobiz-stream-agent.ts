import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { generateGeminiText, generateGeminiTtsPcm8khz, transcribeGeminiPcm } from "@/lib/ai/gemini";
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
  history: HistoryTurn[];
  turnStartedAt: number;
  mediaFrames: number;
  maxRms: number;
  speechLikeFrames: number;
  processedTurns: number;
  detectedMediaEncoding: boolean;
};

const port = Number(process.env.PORT || process.env.VOBIZ_STREAM_PORT || 8080);
const phoneSampleRate = 8000;
const speechRmsThreshold = 0.011;
const bargeInRmsThreshold = 0.028;
const speechStartFrames = 10; // 200 ms of sustained voice before a turn starts.
const minSpeechFrames = 12; // 240 ms.
const bargeInSpeechFrames = 14; // 280 ms before clearing assistant audio.
const endSilenceFrames = 24; // 480 ms.
const maxUtteranceFrames = 900; // 18 seconds.

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
  const chunkBytes = Math.max(160, Math.floor(sampleRate * 2 * 0.02));
  const useMulaw = encoding.toLowerCase().includes("mulaw") || encoding.toLowerCase().includes("pcmu");
  const outbound = useMulaw ? pcm16LeToMulaw(pcm) : pcm;
  const outboundChunkBytes = useMulaw ? Math.max(80, Math.floor(sampleRate * 0.02)) : chunkBytes;

  for (let offset = 0; offset < outbound.length; offset += outboundChunkBytes) {
    const chunk = outbound.subarray(offset, offset + outboundChunkBytes);
    sendJson(ws, {
      event: "playAudio",
      media: {
        contentType: useMulaw ? "audio/x-mulaw" : "audio/x-l16",
        sampleRate,
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
  const isFirstUserTurn = state.history.filter((turn) => turn.role === "user").length <= 1;

  return `${state.agentSystemPrompt || state.scenario.systemPrompt}

You are on a live phone call in India.
Agent name: ${state.agentName || state.scenario.agentName}
Caller name: ${state.name}
Landing-page use case: ${state.useCase || "not provided"}

Conversation so far:
${recentHistory || "No prior caller turns."}

Relevant knowledge:
${retrievedContext || "No relevant uploaded knowledge. Use only the agent context and ask a clear follow-up if needed."}

Caller just said:
${transcript}

Reply as a realistic phone receptionist.
Rules:
- Keep it short, warm, and natural: one or two spoken sentences, usually 10 to 25 words.
- Ask only one question at a time.
- End every turn with a clear handoff, question, confirmation, or wait cue.
- Support English, Malayalam, Tamil, Telugu, Kannada, Hindi, and mixed Indian speech naturally.
- If the caller uses Malayalam, Manglish, Tamil, Telugu, or Kannada, mirror simply and naturally; do not force pure English.
- For non-English replies, prefer simple spoken words in English letters so phone TTS pronounces them cleanly.
- Output plain spoken sentences only: no markdown, bullets, numbered lists, headers, or symbols.
- The transcript can be noisy. If the caller's words are unclear or incoherent, ask them to repeat instead of guessing.
- ${isFirstUserTurn ? "You may greet once if it fits." : "Do not repeat the opening greeting; answer the newest caller utterance directly."}
- Vary phrasing; do not repeat the same sentence across turns.
- Confirm important details.
- If unsure, ask a clear follow-up.
- Use uploaded knowledge only when relevant. Do not dump documents or invent missing facts.
- Do not mention internal systems or providers.
- Do not invent availability, price, or medical advice.`;
}

async function playText(ws: WebSocket, state: CallState, text: string) {
  const started = Date.now();
  const pcm = await generateGeminiTtsPcm8khz({ text });
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
    await recordMessage(state.callId, state.agentId, "system", `${label} TTS failed: ${message.slice(0, 500)}`);
    return null;
  }
}

async function processTurn(ws: WebSocket, state: CallState, pcm: Buffer) {
  if (state.processing || pcm.length < 640) return;
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
    state.history.push({ role: "user", content: transcript });

    let knowledge: AgentKnowledgeChunk[] = [];
    if (state.agentId) {
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

    const reply = cleanText(
      await generateGeminiText(
        [
          {
            role: "user",
            text: buildReplyPrompt(state, transcript, knowledge)
          }
        ],
        { temperature: 0.45, maxOutputTokens: 120 }
      )
    );

    if (!reply) {
      state.processing = false;
      return;
    }

    const ttsLatency = await playText(ws, state, reply);
    await recordMessage(state.callId, state.agentId, "assistant", reply, Date.now() - started);
    await recordMessage(state.callId, state.agentId, "system", `Turn latency: ${Date.now() - started} ms, TTS: ${ttsLatency} ms.`);
    state.history.push({ role: "assistant", content: reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await recordMessage(state.callId, state.agentId, "system", `Orchestration error: ${message}`);
    const fallback = "Sorry, I had a brief issue hearing that. Could you say that once more?";
    try {
      await playText(ws, state, fallback);
      await recordMessage(state.callId, state.agentId, "assistant", fallback);
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
    response.end(JSON.stringify({ ok: true, worker: "vobiz-stream-agent", mode: "gemini-orchestrated" }));
    return;
  }

  response.writeHead(404);
  response.end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, request) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const callId = url.searchParams.get("call_id") || "";
  const scenario = getDemoScenario((url.searchParams.get("scenario") || "dental") as DemoScenarioId);
  const name = url.searchParams.get("name") || "there";
  const useCase = url.searchParams.get("use_case") || "";
  const openingMessageId = url.searchParams.get("opening_message_id") || "";
  let state: CallState | undefined;

  ws.on("message", async (raw) => {
    let message: unknown;
    try {
      message = JSON.parse(raw.toString()) as unknown;
    } catch {
      return;
    }

    if (isStartEvent(message)) {
      const streamId = message.start.streamId;
      const runtime = await getCallRuntime(callId);
      const agentId = runtime?.agentId || "";
      const sampleRate = message.start.mediaFormat?.sampleRate || phoneSampleRate;
      const mediaEncoding = message.start.mediaFormat?.encoding || "audio/x-l16";
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
        history: [],
        turnStartedAt: Date.now(),
        mediaFrames: 0,
        maxRms: 0,
        speechLikeFrames: 0,
        processedTurns: 0,
        detectedMediaEncoding: false
      };

      await recordMessage(
        callId,
        agentId,
        "system",
        `Vobiz stream started: ${streamId} at ${sampleRate} Hz (${mediaEncoding}). Gemini orchestration active.`
      );
      const opening = await getOpening(callId, openingMessageId, runtime?.firstMessage || `Hi ${name}, how can I help?`);
      await tryPlayText(ws, state, opening, "Opening");
      return;
    }

    if (isPlayedEvent(message) && state) {
      if (message.event === "playedStream") state.assistantAudioQueued = false;
      return;
    }

    if (isMediaEvent(message) && message.media?.payload && state) {
      const inbound = Buffer.from(message.media.payload, "base64");
      const encoding = state.mediaEncoding.toLowerCase();
      const looksMulaw = encoding.includes("mulaw") || encoding.includes("pcmu") || inbound.length === Math.floor(state.sampleRate * 0.02);
      if (looksMulaw && !encoding.includes("mulaw") && !encoding.includes("pcmu")) {
        state.mediaEncoding = "audio/x-mulaw";
        if (!state.detectedMediaEncoding) {
          state.detectedMediaEncoding = true;
          void recordMessage(
            state.callId,
            state.agentId,
            "system",
            `Auto-detected Vobiz PCMU media frames (${inbound.length} bytes at ${state.sampleRate} Hz); switched playback to audio/x-mulaw.`
          );
        }
      }
      const inboundLe = looksMulaw ? mulawToPcm16Le(inbound) : swap16(inbound);
      await handleAudioFrame(ws, state, inboundLe);
    }
  });

  ws.on("close", () => {
    if (!state) return;
    if (state.inSpeech && state.speechFrames >= minSpeechFrames) {
      void processTurn(ws, state, Buffer.concat(state.turnBuffers));
    }
    void recordMessage(
      state.callId,
      state.agentId,
      "system",
      `Vobiz stream closed. Frames=${state.mediaFrames}, speech_like=${state.speechLikeFrames}, max_rms=${state.maxRms.toFixed(4)}, processed_turns=${state.processedTurns}.`
    );
  });
});

server.listen(port, () => {
  console.log(`Vobiz Gemini orchestration worker listening on :${port}`);
});
