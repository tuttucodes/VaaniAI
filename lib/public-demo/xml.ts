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
  fallbackUrl,
  interimUrl,
  hints,
  language = "en-IN"
}: {
  message: string;
  actionUrl: string;
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

  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather action="${escapeXml(actionUrl)}" method="POST" inputType="dtmf speech" language="${escapeXml(language)}" speechModel="telephony" speechEndTimeout="2" digitEndTimeout="3" finishOnKey="#" numDigits="1" executionTimeout="22" hints="${escapeXml(hints || "")}" log="true"${interimAttributes}>
    <Speak voice="WOMAN" language="${escapeXml(language)}">${escapeXml(message)}</Speak>
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
