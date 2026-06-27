import type { NextRequest } from "next/server";
import { ok, handleApiError } from "@/lib/api";
import { handleVobizStatusWebhook } from "@/lib/calls/service";

export async function POST(request: NextRequest) {
  try {
    const result = await handleVobizStatusWebhook(request);
    return ok(result);
  } catch (error) {
    return handleApiError(error);
  }
}
