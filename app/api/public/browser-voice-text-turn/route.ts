import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { orchestrateBrowserVoiceTurn } from "@/lib/voice/orchestrator";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  return ok(
    await orchestrateBrowserVoiceTurn({
      event: body.event,
      transcript: body.transcript,
      scenario: body.scenario,
      scenarioId: body.scenario_id || body.scenarioId,
      context: body.context,
      history: body.history
    })
  );
}
