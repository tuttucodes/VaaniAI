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
  hints,
  language = "en-US"
}: {
  message: string;
  actionUrl: string;
  hints?: string;
  language?: string;
}) {
  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather action="${escapeXml(actionUrl)}" method="POST" inputType="speech" language="${escapeXml(language)}" speechModel="phone_call" speechEndTimeout="auto" executionTimeout="12" hints="${escapeXml(hints || "")}">
    <Speak voice="WOMAN" language="${escapeXml(language)}">${escapeXml(message)}</Speak>
  </Gather>
  <Speak voice="WOMAN" language="${escapeXml(language)}">I did not catch that. I will end the demo call now. Thank you.</Speak>
  <Hangup/>
</Response>`);
}

export function speakHangupXml(message: string, language = "en-US") {
  return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak voice="WOMAN" language="${escapeXml(language)}">${escapeXml(message)}</Speak>
  <Hangup/>
</Response>`);
}

