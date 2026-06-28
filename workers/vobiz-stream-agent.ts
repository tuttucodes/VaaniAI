import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { generateGeminiText, generateGeminiTtsPcm8khz, transcribeGeminiPcm } from "@/lib/ai/gemini";
import { getDemoScenario, type DemoScenarioId } from "@/lib/public-demo/scenarios";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

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
  name: string;
  useCase: string;
  sampleRate: number;
  inSpeech: boolean;
  silenceFrames: number;
  speechFrames: number;
  turnBuffers: Buffer[];
  processing: boolean;
  assistantAudioQueued: boolean;
  history: HistoryTurn[];
  turnStartedAt: number;
};

const port = Number(process.env.PORT || process.env.VOBIZ_STREAM_PORT || 8080);
const phoneSampleRate = 8000;
const speechRmsThreshold = 0.012;
const bargeInRmsThreshold = 0.018;
const minSpeechFrames = 8; // 160 ms.
const endSilenceFrames = 28; // 560 ms.
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

function sendPcm(ws: WebSocket, pcm: Buffer, sampleRate = phoneSampleRate) {
  const chunkBytes = Math.max(160, Math.floor(sampleRate * 2 * 0.02));
  for (let offset = 0; offset < pcm.length; offset += chunkBytes) {
    const chunk = pcm.subarray(offset, offset + chunkBytes);
    sendJson(ws, {
      event: "playAudio",
      media: {
        contentType: "audio/x-l16",
        sampleRate,
        payload: chunk.toString("base64")
      }
    });
  }
}

async function getCallAgentId(callId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase || !callId) return "";
  const { data } = await supabase.from("calls").select("agent_id").eq("id", callId).single();
  return data?.agent_id || "";
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
  state.turnBuffers = [];
  state.turnStartedAt = Date.now();
}

function buildReplyPrompt(state: CallState, transcript: string) {
  const recentHistory = state.history
    .slice(-6)
    .map((turn) => `${turn.role === "user" ? "Caller" : "Assistant"}: ${turn.content}`)
    .join("\n");

  return `${state.scenario.systemPrompt}

You are on a live phone call in India.
Caller name: ${state.name}
Landing-page use case: ${state.useCase || "not provided"}

Conversation so far:
${recentHistory || "No prior caller turns."}

Caller just said:
${transcript}

Reply as a realistic phone receptionist.
Rules:
- Keep it short, warm, and natural.
- Ask only one question at a time.
- Support English, Malayalam, Hindi, and mixed speech naturally.
- Confirm important details.
- If unsure, ask a clear follow-up.
- Do not mention internal systems or providers.
- Do not invent availability, price, or medical advice.`;
}

async function playText(ws: WebSocket, state: CallState, text: string) {
  const started = Date.now();
  const pcm = await generateGeminiTtsPcm8khz({ text });
  state.assistantAudioQueued = true;
  sendPcm(ws, pcm, phoneSampleRate);
  sendJson(ws, { event: "checkpoint", streamId: state.streamId, name: `assistant-${Date.now()}` });
  return Date.now() - started;
}

async function processTurn(ws: WebSocket, state: CallState, pcm: Buffer) {
  if (state.processing || pcm.length < 640) return;
  state.processing = true;
  const started = Date.now();

  try {
    const transcript = cleanText(
      await transcribeGeminiPcm({
        pcm,
        sampleRate: phoneSampleRate,
        languageHint: "English, Malayalam, Hindi, or mixed Indian speech"
      })
    );

    if (!transcript || transcript.toLowerCase() === "empty string") {
      state.processing = false;
      return;
    }

    await recordMessage(state.callId, state.agentId, "user", transcript);
    state.history.push({ role: "user", content: transcript });

    const reply = cleanText(
      await generateGeminiText(
        [
          {
            role: "user",
            text: buildReplyPrompt(state, transcript)
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

  if (state.assistantAudioQueued && rms > bargeInRmsThreshold) {
    state.assistantAudioQueued = false;
    sendJson(ws, { event: "clearAudio", streamId: state.streamId });
  }

  if (rms > speechRmsThreshold) {
    if (!state.inSpeech) {
      state.inSpeech = true;
      state.turnStartedAt = Date.now();
      state.turnBuffers = [];
      state.speechFrames = 0;
      state.silenceFrames = 0;
    }
    state.speechFrames += 1;
    state.silenceFrames = 0;
    state.turnBuffers.push(frame);
  } else if (state.inSpeech) {
    state.silenceFrames += 1;
    state.turnBuffers.push(frame);
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
      const agentId = await getCallAgentId(callId);
      const sampleRate = message.start.mediaFormat?.sampleRate || phoneSampleRate;
      state = {
        callId,
        agentId,
        streamId,
        scenario,
        name,
        useCase,
        sampleRate,
        inSpeech: false,
        silenceFrames: 0,
        speechFrames: 0,
        turnBuffers: [],
        processing: false,
        assistantAudioQueued: false,
        history: [],
        turnStartedAt: Date.now()
      };

      await recordMessage(callId, agentId, "system", `Vobiz stream started: ${streamId} at ${sampleRate} Hz. Gemini orchestration active.`);
      const opening = await getOpening(callId, openingMessageId, `Hi ${name}, how can I help?`);
      await playText(ws, state, opening);
      return;
    }

    if (isPlayedEvent(message) && state) {
      if (message.event === "playedStream") state.assistantAudioQueued = false;
      return;
    }

    if (isMediaEvent(message) && message.media?.payload && state) {
      const inboundBe = Buffer.from(message.media.payload, "base64");
      await handleAudioFrame(ws, state, swap16(inboundBe));
    }
  });

  ws.on("close", () => {
    if (!state) return;
    if (state.inSpeech && state.speechFrames >= minSpeechFrames) {
      void processTurn(ws, state, Buffer.concat(state.turnBuffers));
    }
    void recordMessage(state.callId, state.agentId, "system", "Vobiz stream closed.");
  });
});

server.listen(port, () => {
  console.log(`Vobiz Gemini orchestration worker listening on :${port}`);
});
