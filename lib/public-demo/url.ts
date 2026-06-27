import { getEnv } from "@/lib/env";

export function publicBaseUrl(request: Request) {
  const configured = getEnv("NEXT_PUBLIC_APP_URL");
  if (configured) return configured.replace(/\/$/, "");

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (!host) throw new Error("Could not determine public app URL.");
  return `${proto}://${host}`.replace(/\/$/, "");
}

export function assertPublicHttpsUrl(baseUrl: string) {
  if (!baseUrl.startsWith("https://")) {
    throw new Error("Demo calls require a public HTTPS app URL.");
  }
  if (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1")) {
    throw new Error("Demo calls need a deployed public callback URL.");
  }
}
