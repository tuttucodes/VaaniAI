import type { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const callId = new URL(request.url).searchParams.get("call_id");
  const supabase = createSupabaseAdminClient();
  if (supabase && callId) await supabase.from("calls").update({ status: "ringing" }).eq("id", callId);
  return ok({ ok: true });
}

export const GET = POST;

