export function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function xmlResponse(xml: string) {
  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export function speakGatherXml({
  message,
  actionUrl,
  audioUrl,
  fallbackUrl,
  interimUrl,
  hints,
  language = "en-IN"
}: {
  message: string;
  actionUrl: string;
  audioUrl?: string;
  fallbackUrl?: string;
  interimUrl?: string;
  hints?: string;
  language?: string;
}) {
  const interimAttributes = interimUrl
    ? ` interimSpeechResultsCallback="${escapeXml(interimUrl)}" interimSpeechResultsCallbackMethod="POST"`
    : "";
  const fallback = fallbackUrl
    ? `<Redirect method="POST">${escapeXml(fallbackUrl)}</Redirect>`
    : `<Speak voice="WOMAN" language="${escapeXml(language)}">I did not catch that. I will end the demo call now. Thank you.</Speak>
  <Hangup/>`;
  const promptXml = audioUrl
    ? `<Play>${escapeXml(audioUrl)}</Play>`
    : `<Speak voice="WOMAN" language="${escapeXml(language)}">${escapeXml(message)}</Speak>`;

  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather action="${escapeXml(actionUrl)}" method="POST" inputType="speech" speechModel="default" language="${escapeXml(language)}" executionTimeout="30" speechEndTimeout="auto" hints="${escapeXml(hints || "")}" log="true" profanityFilter="false"${interimAttributes}>
    ${promptXml}
  </Gather>
  ${fallback}
</Response>`);
}

export function speakHangupXml(message: string, language = "en-IN") {
  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak voice="WOMAN" language="${escapeXml(language)}">${escapeXml(message)}</Speak>
  <Hangup/>
</Response>`);
}

export function streamXml({
  streamUrl,
  statusCallbackUrl,
  recordingCallbackUrl,
  contentType,
  timeoutSeconds = 600
}: {
  streamUrl: string;
  statusCallbackUrl?: string;
  recordingCallbackUrl?: string;
  contentType?: "audio/x-l16;rate=8000" | "audio/x-l16;rate=16000" | "audio/x-l16;rate=24000" | "audio/x-mulaw;rate=8000";
  timeoutSeconds?: number;
}) {
  const statusAttributes = statusCallbackUrl
    ? ` statusCallbackUrl="${escapeXml(statusCallbackUrl)}" statusCallbackMethod="POST"`
    : "";
  const recordingXml =
    process.env.VOBIZ_RECORDING_ENABLED === "true" && recordingCallbackUrl
      ? `\n  <Record recordSession="true" action="${escapeXml(recordingCallbackUrl)}" callbackUrl="${escapeXml(recordingCallbackUrl)}" maxLength="${timeoutSeconds}" />`
      : "";
  const envContentType = process.env.VOBIZ_STREAM_CONTENT_TYPE;
  const resolvedContentType =
    contentType ||
    (envContentType === "audio/x-l16;rate=8000" ||
    envContentType === "audio/x-l16;rate=16000" ||
    envContentType === "audio/x-l16;rate=24000" ||
    envContentType === "audio/x-mulaw;rate=8000"
      ? envContentType
      : "audio/x-mulaw;rate=8000");

  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>${recordingXml}
  <Stream bidirectional="true" audioTrack="inbound" keepCallAlive="true" contentType="${escapeXml(resolvedContentType)}" streamTimeout="${timeoutSeconds}" maxRetries="2"${statusAttributes}>${escapeXml(streamUrl)}</Stream>
</Response>`);
}
