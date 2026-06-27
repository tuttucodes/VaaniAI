export interface OutboundCallRequest {
  to: string;
  from?: string;
  agentId: string;
  callId: string;
  livekitRoomName: string;
  sipConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface OutboundCallResult {
  provider: string;
  providerCallId?: string;
  status: "queued" | "requires_configuration" | "failed";
  raw?: unknown;
  todo?: string[];
}

export interface TelephonyWebhookResult {
  providerCallId?: string;
  callId?: string;
  agentId?: string;
  status?: string;
  direction?: "inbound" | "outbound";
  recordingUrl?: string;
  phoneNumber?: string;
  livekitRoomName?: string;
  raw: unknown;
}

export interface TelephonyProvider {
  createOutboundCall(request: OutboundCallRequest): Promise<OutboundCallResult>;
  createXmlOutboundCall(request: {
    to: string;
    from?: string;
    answerUrl: string;
    ringUrl?: string;
    hangupUrl?: string;
    fallbackUrl?: string;
    callerName?: string;
    timeLimitSeconds?: number;
    metadata?: Record<string, unknown>;
  }): Promise<OutboundCallResult>;
  hangupCall(providerCallId: string): Promise<{ ok: boolean; raw?: unknown }>;
  handleWebhook(request: Request): Promise<TelephonyWebhookResult>;
  mapCallToLiveKitRoom(input: { providerCallId?: string; callId?: string; agentId: string }): Promise<{
    roomName: string;
    bridgeMetadata: Record<string, unknown>;
  }>;
}
