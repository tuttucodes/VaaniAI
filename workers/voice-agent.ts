import { createLiveKitToken } from "@/lib/livekit/server";
import { handleFinalTranscript, prefetchForPartialTranscript } from "@/lib/voice/pipeline";

interface WorkerConfig {
  userId: string;
  agentId: string;
  callId: string;
  roomName: string;
  identity: string;
}

function readConfig(): WorkerConfig {
  const userId = process.env.VOICE_WORKER_USER_ID;
  const agentId = process.env.VOICE_WORKER_AGENT_ID;
  const callId = process.env.VOICE_WORKER_CALL_ID;
  const roomName = process.env.VOICE_WORKER_ROOM_NAME;

  if (!userId || !agentId || !callId || !roomName) {
    throw new Error("VOICE_WORKER_USER_ID, VOICE_WORKER_AGENT_ID, VOICE_WORKER_CALL_ID, and VOICE_WORKER_ROOM_NAME are required.");
  }

  return {
    userId,
    agentId,
    callId,
    roomName,
    identity: process.env.VOICE_WORKER_IDENTITY || `agent-${agentId}`
  };
}

async function main() {
  const config = readConfig();
  const livekit = await import("livekit-client");
  const token = await createLiveKitToken({
    roomName: config.roomName,
    identity: config.identity,
    name: "Vaani Voice Worker"
  });

  const room = new livekit.Room({
    adaptiveStream: false,
    dynacast: false
  });

  room.on(livekit.RoomEvent.DataReceived, async (payload: Uint8Array, participant: unknown, _kind: unknown, topic?: string) => {
    const text = new TextDecoder().decode(payload);

    if (topic === "partial-transcript") {
      await prefetchForPartialTranscript({
        userId: config.userId,
        agentId: config.agentId,
        callId: config.callId,
        transcript: text,
        isPartial: true
      });
      return;
    }

    if (topic === "final-transcript" || topic === undefined) {
      const result = await handleFinalTranscript({
        userId: config.userId,
        agentId: config.agentId,
        callId: config.callId,
        transcript: text
      });

      await room.localParticipant.publishData(new TextEncoder().encode(result.assistantText), {
        reliable: true,
        topic: "assistant-transcript"
      });
    }
  });

  room.on(livekit.RoomEvent.TrackSubscribed, async (track: unknown) => {
    console.log("Audio track subscribed. TODO: pipe PCM frames into Gemini Live STT and publish Gemini TTS audio frames.", {
      track: Boolean(track)
    });
  });

  await room.connect(token.url, token.token, {
    autoSubscribe: true
  });

  console.log(`Voice worker joined ${config.roomName} as ${config.identity}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
