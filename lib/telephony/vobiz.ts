import crypto from "node:crypto";
import { getEnv } from "@/lib/env";
import type { OutboundCallRequest, OutboundCallResult, TelephonyProvider, TelephonyWebhookResult } from "./provider";

const TODO_ITEMS = [
  "TODO: confirm exact Vobiz outbound call API path and request body.",
  "TODO: confirm Vobiz auth header format beyond API key bearer token.",
  "TODO: confirm SIP trunk / LiveKit bridge fields accepted by Vobiz.",
  "TODO: confirm Vobiz webhook event names and payload field mapping.",
  "TODO: confirm Vobiz webhook signature header and HMAC format."
];

function configuredPath(name: string) {
  return getEnv(name);
}

function buildUrl(pathEnvName: string) {
  const base = getEnv("VOBIZ_BASE_URL");
  const path = configuredPath(pathEnvName);
  if (!base || !path) return null;
  return new URL(path, base).toString();
}

function vobizAuth() {
  const authId = getEnv("VOBIZ_AUTH_ID");
  const authToken = getEnv("VOBIZ_AUTH_SECRET") || getEnv("VOBIZ_API_KEY");
  return { authId, authToken };
}

function vobizCallUrl() {
  const base = getEnv("VOBIZ_BASE_URL") || "https://api.vobiz.ai/api/v1";
  const { authId } = vobizAuth();
  if (!authId) return null;
  return new URL(`Account/${authId}/Call/`, base.endsWith("/") ? base : `${base}/`).toString();
}

function vobizRecordingUrl(providerCallId: string) {
  const base = getEnv("VOBIZ_BASE_URL") || "https://api.vobiz.ai/api/v1";
  const { authId } = vobizAuth();
  if (!authId || !providerCallId) return null;
  const url = new URL(`Account/${authId}/Recording/`, base.endsWith("/") ? base : `${base}/`);
  url.searchParams.set("call_uuid", providerCallId);
  url.searchParams.set("limit", "1");
  return url.toString();
}

function toVobizDialString(number?: string) {
  return (number || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
}

function verifySignature(body: string, signature: string | null) {
  const secret = getEnv("VOBIZ_WEBHOOK_SECRET");
  if (!secret) return true;
  if (!signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function parseVobizBody(body: string, contentType = "") {
  if (contentType.includes("application/json")) {
    return JSON.parse(body || "{}") as Record<string, unknown>;
  }

  const params = new URLSearchParams(body);
  const parsed: Record<string, unknown> = {};
  for (const [key, value] of params.entries()) parsed[key] = value;
  if (Object.keys(parsed).length) return parsed;
  return JSON.parse(body || "{}") as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

function extractRecordingUrl(record: unknown) {
  if (!record || typeof record !== "object") return "";
  return stringField(record as Record<string, unknown>, ["recording_url", "record_url", "RecordUrl", "RecordingUrl", "url"]);
}

export async function fetchVobizRecordingUrl(providerCallId: string) {
  const url = vobizRecordingUrl(providerCallId);
  const { authId, authToken } = vobizAuth();
  if (!url || !authId || !authToken) return "";

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-auth-id": authId,
        "x-auth-token": authToken
      },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) return "";
    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const objects = Array.isArray(raw.objects) ? raw.objects : Array.isArray(raw.data) ? raw.data : [];
    return extractRecordingUrl(objects[0]) || extractRecordingUrl(raw);
  } catch {
    return "";
  }
}

export class VobizTelephonyProvider implements TelephonyProvider {
  async createXmlOutboundCall(request: {
    to: string;
    from?: string;
    answerUrl: string;
    ringUrl?: string;
    hangupUrl?: string;
    fallbackUrl?: string;
    callerName?: string;
    timeLimitSeconds?: number;
    metadata?: Record<string, unknown>;
  }): Promise<OutboundCallResult> {
    const url = vobizCallUrl();
    const { authId, authToken } = vobizAuth();
    const from = toVobizDialString(request.from || getEnv("VOBIZ_PHONE_NUMBER") || getEnv("DEFAULT_FROM_NUMBER"));
    const to = toVobizDialString(request.to);

    if (!url || !authId || !authToken || !from || !to) {
      return {
        provider: "vobiz",
        status: "requires_configuration",
        todo: [
          "Set VOBIZ_BASE_URL=https://api.vobiz.ai/api/v1",
          "Set VOBIZ_AUTH_ID and VOBIZ_AUTH_SECRET from Vobiz.",
          "Set VOBIZ_PHONE_NUMBER or DEFAULT_FROM_NUMBER to a Vobiz caller ID.",
          "Use a public HTTPS app URL for answer_url callbacks."
        ]
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-id": authId,
        "x-auth-token": authToken
      },
      body: JSON.stringify({
        from,
        to,
        answer_url: request.answerUrl,
        answer_method: "POST",
        ring_url: request.ringUrl,
        ring_method: request.ringUrl ? "POST" : undefined,
        hangup_url: request.hangupUrl,
        hangup_method: request.hangupUrl ? "POST" : undefined,
        fallback_url: request.fallbackUrl,
        fallback_method: request.fallbackUrl ? "POST" : undefined,
        caller_name: request.callerName || "Vaani AI",
        time_limit: request.timeLimitSeconds || 240,
        machine_detection: "false"
      })
    });

    const raw = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        provider: "vobiz",
        status: "failed",
        raw
      };
    }

    const record = raw as Record<string, unknown>;
    return {
      provider: "vobiz",
      status: "queued",
      providerCallId: String(record.call_uuid || record.CallUUID || record.call_id || record.uuid || record.request_uuid || record.api_id || ""),
      raw
    };
  }

  async createOutboundCall(request: OutboundCallRequest): Promise<OutboundCallResult> {
    const url = buildUrl("VOBIZ_OUTBOUND_CALL_PATH");
    const apiKey = getEnv("VOBIZ_API_KEY");

    if (!url || !apiKey) {
      return {
        provider: "vobiz",
        status: "requires_configuration",
        todo: TODO_ITEMS
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        to: request.to,
        from: request.from,
        customer_reference: request.callId,
        livekit_room_name: request.livekitRoomName,
        sip_bridge: request.sipConfig,
        metadata: {
          ...request.metadata,
          agent_id: request.agentId,
          call_id: request.callId
        }
      })
    });

    const raw = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        provider: "vobiz",
        status: "failed",
        raw
      };
    }

    return {
      provider: "vobiz",
      status: "queued",
      providerCallId: raw.call_id || raw.id || raw.uuid,
      raw
    };
  }

  async hangupCall(providerCallId: string) {
    const url = buildUrl("VOBIZ_HANGUP_CALL_PATH");
    const apiKey = getEnv("VOBIZ_API_KEY");

    if (!url || !apiKey) {
      return {
        ok: false,
        raw: { todo: TODO_ITEMS, providerCallId }
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ call_id: providerCallId })
    });

    const raw = await response.json().catch(() => ({}));
    return { ok: response.ok, raw };
  }

  async handleWebhook(request: Request): Promise<TelephonyWebhookResult> {
    const body = await request.text();
    const signature = request.headers.get("x-vobiz-signature");

    if (!verifySignature(body, signature)) {
      throw new Error("Invalid Vobiz webhook signature");
    }

    const raw = parseVobizBody(body, request.headers.get("content-type") || "");
    const metadata = typeof raw.metadata === "object" && raw.metadata ? (raw.metadata as Record<string, unknown>) : {};

    return {
      providerCallId: stringField(raw, ["call_uuid", "CallUUID", "call_id", "CallID", "id", "uuid"]),
      callId: stringField(raw, ["customer_reference", "call_reference", "app_call_id"]) || undefined,
      agentId:
        typeof raw.agent_id === "string"
          ? raw.agent_id
          : typeof metadata.agent_id === "string"
            ? metadata.agent_id
            : undefined,
      status: typeof raw.status === "string" ? raw.status : typeof raw.event === "string" ? raw.event : undefined,
      direction: raw.direction === "inbound" ? "inbound" : raw.direction === "outbound" ? "outbound" : undefined,
      recordingUrl: extractRecordingUrl(raw) || undefined,
      phoneNumber: stringField(raw, ["phone_number", "from", "From", "Caller"]) || undefined,
      livekitRoomName: typeof raw.livekit_room_name === "string" ? raw.livekit_room_name : undefined,
      raw
    };
  }

  async mapCallToLiveKitRoom(input: { providerCallId?: string; callId?: string; agentId: string }) {
    const roomName = input.callId ? `call_${input.callId}` : `vobiz_${input.providerCallId || crypto.randomUUID()}`;

    return {
      roomName,
      bridgeMetadata: {
        provider: "vobiz",
        providerCallId: input.providerCallId,
        agentId: input.agentId,
        todo: "TODO: map Vobiz SIP bridge fields to LiveKit room/SIP metadata after Vobiz payload is confirmed."
      }
    };
  }
}

export const vobizProvider = new VobizTelephonyProvider();
