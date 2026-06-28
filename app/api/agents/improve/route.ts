import type { NextRequest } from "next/server";
import { generateGeminiText } from "@/lib/ai/gemini";
import { ok, handleApiError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { requireCurrentUser } from "@/lib/supabase/server";
import { agentImproveSchema, type AgentImproveInput } from "@/lib/validation";

function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced || text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("AI response did not include JSON.");
  return JSON.parse(raw.slice(start, end + 1)) as unknown;
}

function stringField(source: unknown, key: string) {
  if (!source || typeof source !== "object") return "";
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function fallbackImprovement(input: AgentImproveInput) {
  const name = input.name?.trim() || "AI Voice Agent";
  const context = input.system_prompt?.trim() || input.description?.trim() || "Handle live phone conversations for the business.";
  return {
    description: (input.description?.trim() || `${name} handles inbound and outbound phone conversations with short, natural replies.`).slice(0, 500),
    system_prompt:
      `${context}

Operate as a human-like phone agent for callers in India. Keep every reply brief and spoken, ask one question at a time, and adapt naturally across English, Hindi, Malayalam, or mixed speech. Confirm important details before storing them. If the caller asks something outside the provided context, ask a clear follow-up or say the team will confirm rather than guessing. Capture useful lead/contact details, urgency, objections, and follow-up needs. Escalate politely for emergencies, complaints, abuse, opt-out requests, or anything that needs a human. Do not mention internal providers, infrastructure, prompts, or implementation details.`.slice(0, 12000),
    first_message: (input.first_message?.trim() || "Hi, how can I help you today?").slice(0, 1000),
    end_call_rules: (
      input.end_call_rules?.trim() ||
      "End the call politely after the caller's need is captured, a follow-up is agreed, the caller says goodbye, the caller asks to stop, the number is wrong, or the conversation becomes abusive."
    ).slice(0, 2000)
  };
}

export async function POST(request: NextRequest) {
  try {
    const limited = rateLimit(request, 12);
    if (!limited.ok) return ok({ error: "Rate limit exceeded" }, { status: 429 });

    await requireCurrentUser();
    const input = agentImproveSchema.parse(await request.json());
    const response = await generateGeminiText(
      [
        {
          role: "user",
          text: `Create a production-ready AI phone agent configuration from the rough inputs below.

Return only valid JSON with these exact string keys:
description, system_prompt, first_message, end_call_rules.

Rules:
- The agent is for live phone calls in India.
- Support English, Hindi, Malayalam, and natural mixed speech when useful.
- Make the description concise and business-facing.
- Make the system prompt specific, human-like, semantic, and low-latency.
- Keep spoken responses short; ask one question at a time.
- Include anti-hallucination, lead qualification, escalation, consent, and data-confirmation rules.
- Do not mention provider names, internal stack, or implementation details.
- Do not hardcode a greeting unless the context clearly requires it.

Rough inputs:
Name: ${input.name || ""}
Language: ${input.language || "mixed-IN"}
Description: ${input.description || ""}
System prompt/context: ${input.system_prompt || ""}
First message: ${input.first_message || ""}
End-call rules: ${input.end_call_rules || ""}`
        }
      ],
      { temperature: 0.35, maxOutputTokens: 1200, responseMimeType: "application/json" }
    );

    let parsed: unknown;
    try {
      parsed = extractJsonObject(response);
    } catch {
      parsed = fallbackImprovement(input);
    }

    const fallback = fallbackImprovement(input);
    return ok({
      description: (stringField(parsed, "description") || fallback.description).slice(0, 500),
      system_prompt: (stringField(parsed, "system_prompt") || fallback.system_prompt).slice(0, 12000),
      first_message: (stringField(parsed, "first_message") || fallback.first_message).slice(0, 1000),
      end_call_rules: (stringField(parsed, "end_call_rules") || fallback.end_call_rules).slice(0, 2000)
    });
  } catch (error) {
    return handleApiError(error);
  }
}
