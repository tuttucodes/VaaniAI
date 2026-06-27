import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { getEnv, isDemoMode, isLiveKitConfigured, requireEnv } from "@/lib/env";

export interface LiveKitRoomOptions {
  roomName: string;
  metadata?: Record<string, unknown>;
}

export async function ensureLiveKitRoom({ roomName, metadata }: LiveKitRoomOptions) {
  if (!isLiveKitConfigured() && isDemoMode()) {
    return {
      name: roomName,
      provider: "demo",
      metadata
    };
  }
  if (!isLiveKitConfigured()) throw new Error("LiveKit env vars are required outside demo mode.");

  const client = new RoomServiceClient(
    requireEnv("LIVEKIT_URL"),
    requireEnv("LIVEKIT_API_KEY"),
    requireEnv("LIVEKIT_API_SECRET")
  );

  try {
    await client.createRoom({
      name: roomName,
      emptyTimeout: 300,
      maxParticipants: 8,
      metadata: JSON.stringify(metadata || {})
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("already exists")) {
      throw error;
    }
  }

  return {
    name: roomName,
    provider: "livekit",
    metadata
  };
}

export async function createLiveKitToken({
  roomName,
  identity,
  name
}: {
  roomName: string;
  identity: string;
  name?: string;
}) {
  if (!isLiveKitConfigured() && isDemoMode()) {
    return {
      token: `demo-token-${roomName}-${identity}`,
      url: "ws://localhost:7880",
      demo: true
    };
  }
  if (!isLiveKitConfigured()) throw new Error("LiveKit env vars are required outside demo mode.");

  const token = new AccessToken(requireEnv("LIVEKIT_API_KEY"), requireEnv("LIVEKIT_API_SECRET"), {
    identity,
    name,
    ttl: "2h"
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true
  });

  return {
    token: await token.toJwt(),
    url: getEnv("LIVEKIT_URL"),
    demo: false
  };
}

export function liveKitRoomName(callId: string) {
  return `call_${callId.replace(/-/g, "").slice(0, 24)}`;
}
