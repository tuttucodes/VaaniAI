const VOICE_ASSET_PATH = "/storage/v1/object/public/voice-assets/";

function normalizedSupabaseOrigin(supabaseUrl: string) {
  try {
    const url = new URL(supabaseUrl);
    return url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
}

export function publicVoiceAssetUrl(supabaseUrl: string, assetPath: string) {
  const origin = normalizedSupabaseOrigin(supabaseUrl);
  const cleanPath = assetPath.replace(/^\/+/, "");
  return origin && cleanPath ? `${origin}${VOICE_ASSET_PATH}${cleanPath}` : "";
}

export function isAllowedVoiceAssetUrl(candidate: string, supabaseUrl: string) {
  const origin = normalizedSupabaseOrigin(supabaseUrl);
  if (!candidate || !origin) return false;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && url.origin === origin && url.pathname.startsWith(VOICE_ASSET_PATH);
  } catch {
    return false;
  }
}

export function rawPcmDurationMs(pcm: Buffer, sampleRate = 8_000) {
  if (!pcm.length || sampleRate <= 0) return 0;
  return Math.round((pcm.length / 2 / sampleRate) * 1_000);
}
