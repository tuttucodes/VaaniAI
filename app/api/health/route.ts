import { ok } from "@/lib/api";
import { providerStatus } from "@/lib/env";

export async function GET() {
  const status = providerStatus();
  const ready = status.demoMode || (status.supabase && status.gemini && status.livekit);

  return ok(
    {
      ok: ready,
      mode: status.demoMode ? "demo" : "production",
      services_ready: ready,
      real_calls_ready: status.vobiz && status.supabase && status.gemini && status.livekit
    },
    { status: ready ? 200 : 503 }
  );
}
