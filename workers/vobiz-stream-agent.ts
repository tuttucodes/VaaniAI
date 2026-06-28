import http from "node:http";
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";
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

type CallState = {
  callId: string;
  agentId: string;
  streamId: string;
  scenario: ReturnType<typeof getDemoScenario>;
  name: string;
  useCase: string;
  vobizSampleRate: number;
  gemini?: Session;
  userTranscript: string;
  assistantTranscript: string;
  assistantAudioQueued: boolean;
  firstAudioAt?: number;
  startedAt: number;
};

const port = Number(process.env.PORT || process.env.VOBIZ_STREAM_PORT || 8080);
const geminiInputRate = 16000;
const defaultVobizRate = 16000;
const defaultGeminiOutputRate = 24000;

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

function cleanTranscript(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function parsePcmRate(mimeType?: string) {
  const match = mimeType?.match(/rate=(\d+)/i);
  return match ? Number(match[1]) : defaultGeminiOutputRate;
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

function sendPcm(ws: WebSocket, pcm: Buffer, sampleRate: number) {
  const chunkBytes = Math.max(320, Math.floor(sampleRate * 2 * 0.02));
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
  const cleanContent = cleanTranscript(content);
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

async function flushTurn(state: CallState) {
  const latencyMs = state.firstAudioAt ? state.firstAudioAt - state.startedAt : 0;
  const user = cleanTranscript(state.userTranscript);
  const assistant = cleanTranscript(state.assistantTranscript);

  if (user) await recordMessage(state.callId, state.agentId, "user", user);
  if (assistant) await recordMessage(state.callId, state.agentId, "assistant", assistant, latencyMs);

  state.userTranscript = "";
  state.assistantTranscript = "";
  state.firstAudioAt = undefined;
}

function buildSystemInstruction(state: Pick<CallState, "scenario" | "name" | "useCase">) {
  return `${state.scenario.systemPrompt}

You are on a live phone call in India. Speak naturally, warmly, and briefly.
Support Indian English, Hindi, Malayalam, and mixed speech/code-switching.
Ask one question at a time. Confirm important details. Do not hallucinate.
Use short spoken phrases. Avoid robotic repetition. If unsure, ask a clear follow-up.
Caller name: ${state.name}
Landing-page use case: ${state.useCase || "not provided"}`;
}

async function connectGeminiLive(ws: WebSocket, state: CallState, opening: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    await recordMessage(state.callId, state.agentId, "system", "Gemini Live could not start because GEMINI_API_KEY is missing.");
    return undefined;
  }

  const ai = new GoogleGenAI({ apiKey });
  const voiceName = process.env.GEMINI_LIVE_VOICE || process.env.GEMINI_TTS_VOICE || "Achird";
  const model = process.env.GEMINI_LIVE_MODEL || "gemini-live-2.5-flash-preview";

  const session = await ai.live.connect({
    model,
    config: {
      responseModalities: [Modality.AUDIO],
      temperature: 0.55,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: buildSystemInstruction(state),
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName
          }
        }
      },
      thinkingConfig: {
        includeThoughts: false
      }
    },
    callbacks: {
      onmessage: (message: LiveServerMessage) => {
        const serverContent = message.serverContent;
        if (!serverContent) return;

        if (serverContent.interrupted) {
          state.assistantAudioQueued = false;
          sendJson(ws, { event: "clearAudio", streamId: state.streamId });
        }

        const inputText = serverContent.inputTranscription?.text || serverContent.interimInputTranscription?.text || "";
        if (inputText) state.userTranscript += inputText;

        const outputText = serverContent.outputTranscription?.text || "";
        if (outputText) state.assistantTranscript += outputText;

        for (const part of serverContent.modelTurn?.parts || []) {
          const inlineData = part.inlineData;
          if (!inlineData?.data) continue;

          if (!state.firstAudioAt) state.firstAudioAt = Date.now();
          const inputRate = parsePcmRate(inlineData.mimeType);
          const pcm = Buffer.from(inlineData.data, "base64");
          const vobizPcm = resamplePcm16Mono(pcm, inputRate, state.vobizSampleRate);
          state.assistantAudioQueued = true;
          sendPcm(ws, vobizPcm, state.vobizSampleRate);
        }

        if (serverContent.generationComplete || serverContent.turnComplete) {
          sendJson(ws, { event: "checkpoint", streamId: state.streamId, name: `turn-${Date.now()}` });
          void flushTurn(state);
        }
      },
      onerror: (event: ErrorEvent) => {
        void recordMessage(state.callId, state.agentId, "system", `Gemini Live error: ${event.message || "unknown"}`);
      },
      onclose: () => {
        void recordMessage(state.callId, state.agentId, "system", "Gemini Live session closed.");
      }
    }
  });

  session.sendClientContent({
    turns: [
      {
        role: "user",
        parts: [
          {
            text: `Start the live phone call now. Use this planned opening as intent, not a script: ${opening}`
          }
        ]
      }
    ],
    turnComplete: true
  });

  return session;
}

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, worker: "vobiz-stream-agent", mode: "gemini-live" }));
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
      const vobizSampleRate = message.start.mediaFormat?.sampleRate || defaultVobizRate;
      state = {
        callId,
        agentId,
        streamId,
        scenario,
        name,
        useCase,
        vobizSampleRate,
        userTranscript: "",
        assistantTranscript: "",
        assistantAudioQueued: false,
        startedAt: Date.now()
      };

      await recordMessage(callId, agentId, "system", `Vobiz stream started: ${streamId} at ${vobizSampleRate} Hz.`);
      const opening = await getOpening(callId, openingMessageId, `Hi ${name}, how can I help?`);
      state.gemini = await connectGeminiLive(ws, state, opening);
      return;
    }

    if (isPlayedEvent(message) && state) {
      if (message.event === "playedStream") state.assistantAudioQueued = false;
      return;
    }

    if (isMediaEvent(message) && message.media?.payload && state?.gemini) {
      const inboundBe = Buffer.from(message.media.payload, "base64");
      const inboundLe = swap16(inboundBe);
      if (state.assistantAudioQueued && rmsPcm16Le(inboundLe) > 0.018) {
        state.assistantAudioQueued = false;
        sendJson(ws, { event: "clearAudio", streamId: state.streamId });
      }
      const geminiPcm = resamplePcm16Mono(inboundLe, state.vobizSampleRate, geminiInputRate);
      state.gemini.sendRealtimeInput({
        audio: {
          data: geminiPcm.toString("base64"),
          mimeType: `audio/pcm;rate=${geminiInputRate}`
        }
      });
    }
  });

  ws.on("close", () => {
    if (!state) return;
    void flushTurn(state);
    state.gemini?.close();
    void recordMessage(state.callId, state.agentId, "system", "Vobiz stream closed.");
  });
});

server.listen(port, () => {
  console.log(`Vobiz Gemini Live stream worker listening on :${port}`);
});
