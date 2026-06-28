import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { generateGeminiText, generateGeminiTtsPcm8khz } from "@/lib/ai/gemini";
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

const port = Number(process.env.PORT || process.env.VOBIZ_STREAM_PORT || 8080);
const chunkBytes = 320; // 20 ms, 8 kHz, 16-bit mono PCM.

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function sendPcm(ws: WebSocket, pcm: Buffer) {
  for (let offset = 0; offset < pcm.length; offset += chunkBytes) {
    const chunk = pcm.subarray(offset, offset + chunkBytes);
    sendJson(ws, {
      event: "playAudio",
      media: {
        contentType: "audio/x-l16",
        sampleRate: 8000,
        payload: chunk.toString("base64")
      }
    });
  }
}

async function recordMessage(callId: string, role: "system" | "user" | "assistant", content: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase || !callId || !content.trim()) return;
  const { data: call } = await supabase.from("calls").select("agent_id").eq("id", callId).single();
  if (!call?.agent_id) return;
  await supabase.from("call_messages").insert({
    call_id: callId,
    agent_id: call.agent_id,
    role,
    content,
    latency_ms: 0
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
    .eq("role", "assistant")
    .single();
  return data?.content || fallback;
}

async function playText(ws: WebSocket, text: string) {
  const pcm = await generateGeminiTtsPcm8khz({ text });
  sendPcm(ws, pcm);
  sendJson(ws, { event: "checkpoint", name: `assistant-${Date.now()}` });
}

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, worker: "vobiz-stream-agent" }));
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
  let streamId = "";
  let mediaFrames = 0;

  ws.on("message", async (raw) => {
    const message = JSON.parse(raw.toString()) as unknown;
    if (isStartEvent(message)) {
      streamId = message.start.streamId;
      await recordMessage(callId, "system", `Vobiz stream started: ${streamId}`);
      const opening = await getOpening(callId, openingMessageId, `Hi ${name}, how can I help?`);
      await playText(ws, opening);
      return;
    }

    if (isMediaEvent(message) && message.media?.payload) {
      mediaFrames += 1;
      // MVP diagnostic: Vobiz Stream is wired. Real STT should consume these frames continuously.
      if (mediaFrames === 50) {
        await recordMessage(callId, "system", "Caller audio stream detected. STT pipeline worker is ready to be connected.");
        const reply = await generateGeminiText(
          [
            {
              role: "user",
              text: `${scenario.systemPrompt}

The caller is on a live phone stream. The landing-page use case is: ${useCase}.
Give one short natural bridging line while the full streaming STT pipeline is being connected.`
            }
          ],
          { temperature: 0.45, maxOutputTokens: 50 }
        ).catch(() => "Got it. One second, let me check that.");
        await recordMessage(callId, "assistant", reply);
        await playText(ws, reply);
      }
    }
  });

  ws.on("close", () => {
    void recordMessage(callId, "system", `Vobiz stream closed after ${mediaFrames} audio frames.`);
  });
});

server.listen(port, () => {
  console.log(`Vobiz stream worker listening on :${port}`);
});
