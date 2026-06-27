import { createClient } from "@supabase/supabase-js";
import { analyzeCallTranscript, insightFromAnalysis } from "@/lib/ai/gemini";

async function main() {
  const callId = process.argv[2];
  if (!callId) throw new Error("Usage: tsx scripts/simulate-dental-call.ts <call-id>");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Supabase env vars are required.");

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: call, error: callError } = await supabase.from("calls").select("*, agents(*)").eq("id", callId).single();
  if (callError) throw callError;

  await supabase.from("call_messages").delete().eq("call_id", callId);
  await supabase.from("call_metrics").delete().eq("call_id", callId);
  await supabase.from("call_insights").delete().eq("call_id", callId);
  await supabase.from("extracted_leads").delete().eq("call_id", callId);
  await supabase.from("agent_learning_events").delete().eq("source_call_id", callId);
  await supabase.from("unanswered_questions").delete().eq("call_id", callId);

  const turns = [
    { role: "assistant", content: "Hi, Pearl Dental Care Kochi. This is Maya. How can I help you today?", latency_ms: 180 },
    { role: "user", content: "Hi, I am Rahul. I have tooth pain and I want an appointment tomorrow evening.", latency_ms: 0 },
    { role: "assistant", content: "I can help with that. Do you have swelling, fever, or any bleeding?", latency_ms: 286 },
    {
      role: "user",
      content:
        "No swelling or fever. It is sensitivity and pain on the left side. After 5 PM is good. My number is +91 99999 99999.",
      latency_ms: 0
    },
    {
      role: "assistant",
      content:
        "Got it. I will request a callback for tomorrow after 5 PM for tooth pain and sensitivity. Could you share your full name once more for the appointment note?",
      latency_ms: 294
    },
    { role: "user", content: "Rahul Babu. Please ask the clinic to call me back.", latency_ms: 0 },
    {
      role: "assistant",
      content:
        "Thanks, Rahul. I have noted tooth pain and sensitivity, callback after 5 PM tomorrow, at this phone number. The clinic team will confirm the exact slot.",
      latency_ms: 248
    }
  ] as const;

  const { error: messageError } = await supabase.from("call_messages").insert(
    turns.map((turn, index) => ({
      call_id: callId,
      agent_id: call.agent_id,
      role: turn.role,
      content: turn.content,
      latency_ms: turn.latency_ms,
      timestamp: new Date(Date.now() + index * 12000).toISOString()
    }))
  );
  if (messageError) throw messageError;

  const { error: metricError } = await supabase.from("call_metrics").insert({
    call_id: callId,
    speech_end_to_transcript_ms: 82,
    transcript_to_first_token_ms: 118,
    first_token_to_first_audio_ms: 84,
    rag_retrieval_ms: 21,
    total_response_latency_ms: 284,
    interruption_count: 0,
    average_response_latency_ms: 276,
    estimated_cost: 1.84
  });
  if (metricError) throw metricError;

  const transcript = turns.map((message) => `${message.role}: ${message.content}`).join("\n");
  const analysis = await analyzeCallTranscript({ transcript, agentPrompt: call.agents.system_prompt });

  await supabase.from("call_insights").upsert(insightFromAnalysis(analysis, callId, call.agent_id), {
    onConflict: "call_id"
  });

  const lead = analysis.lead || {};
  if (Object.keys(lead).length) {
    await supabase.from("extracted_leads").insert({
      call_id: callId,
      agent_id: call.agent_id,
      name: typeof lead.name === "string" ? lead.name : null,
      phone: typeof lead.phone === "string" ? lead.phone : call.phone_number,
      email: typeof lead.email === "string" ? lead.email : null,
      company: typeof lead.company === "string" ? lead.company : null,
      requirement: typeof lead.requirement === "string" ? lead.requirement : null,
      budget: typeof lead.budget === "string" ? lead.budget : null,
      timeline: typeof lead.timeline === "string" ? lead.timeline : null,
      status: "new",
      custom_fields: lead
    });
  }

  const suggestedLearnings = analysis.suggested_learnings || [];
  if (suggestedLearnings.length) {
    await supabase.from("agent_learning_events").insert(
      suggestedLearnings.map((learning) => ({
        agent_id: call.agent_id,
        source_call_id: callId,
        suggested_learning: typeof learning === "string" ? learning : learning.content || "",
        reason: typeof learning === "string" ? null : learning.reason || null,
        confidence_score: typeof learning === "string" ? null : learning.confidence || null,
        status: "pending"
      }))
    );
  }

  const unanswered = analysis.unanswered_questions || [];
  if (unanswered.length) {
    await supabase.from("unanswered_questions").insert(
      unanswered.map((question) => ({
        call_id: callId,
        agent_id: call.agent_id,
        question: typeof question === "string" ? question : question.question || "",
        attempted_answer: typeof question === "string" ? null : question.attempted_answer || null,
        reason_failed: typeof question === "string" ? null : question.reason_failed || null,
        status: "open"
      }))
    );
  }

  await supabase
    .from("calls")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      duration_seconds: 96,
      total_cost_estimate: 1.84,
      summary: analysis.summary || null
    })
    .eq("id", callId);

  console.log(
    JSON.stringify(
      {
        ok: true,
        callId,
        summary: analysis.summary,
        intent: analysis.intent,
        sentiment: analysis.sentiment,
        outcome: analysis.outcome
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
