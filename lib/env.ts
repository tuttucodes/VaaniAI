const requiredServerEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY"
] as const;

export function getEnv(name: string) {
  return process.env[name]?.trim() || "";
}

export function isDemoMode() {
  const explicit = getEnv("VAANI_DEMO_MODE").toLowerCase();
  if (["1", "true", "yes", "on"].includes(explicit)) return true;
  if (["0", "false", "no", "off"].includes(explicit)) return false;
  return process.env.NODE_ENV !== "production" && !isSupabaseConfigured();
}

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production" && !isDemoMode();
}

export function isSupabaseConfigured() {
  return requiredServerEnv.every((name) => Boolean(getEnv(name)));
}

export function isGeminiConfigured() {
  return Boolean(getEnv("GEMINI_API_KEY"));
}

export function isLiveKitConfigured() {
  return Boolean(getEnv("LIVEKIT_URL") && getEnv("LIVEKIT_API_KEY") && getEnv("LIVEKIT_API_SECRET"));
}

export function isVobizConfigured() {
  return Boolean(
    getEnv("VOBIZ_BASE_URL") &&
      getEnv("VOBIZ_AUTH_ID") &&
      (getEnv("VOBIZ_AUTH_SECRET") || getEnv("VOBIZ_API_KEY")) &&
      (getEnv("VOBIZ_PHONE_NUMBER") || getEnv("DEFAULT_FROM_NUMBER"))
  );
}

export function requireEnv(name: string) {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function providerStatus() {
  return {
    demoMode: isDemoMode(),
    productionRuntime: isProductionRuntime(),
    supabase: isSupabaseConfigured(),
    gemini: isGeminiConfigured(),
    livekit: isLiveKitConfigured(),
    vobiz: isVobizConfigured()
  };
}
