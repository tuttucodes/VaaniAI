import { ok } from "@/lib/api";
import { providerStatus } from "@/lib/env";

export async function GET() {
  const status = providerStatus();
  const ready = status.demoMode || (status.supabase && status.gemini && status.livekit);

  return ok(
    {
      ok: ready,
      status,
      required_for_real_calls: {
        supabase: status.supabase,
        gemini: status.gemini,
        livekit: status.livekit,
        vobiz: status.vobiz
      }
    },
    { status: ready ? 200 : 503 }
  );
}
