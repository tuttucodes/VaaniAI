import type {
  Agent,
  AgentKnowledgeFile,
  AgentLearningEvent,
  AgentMemory,
  Call,
  CallInsight,
  CallMessage,
  CallMetric,
  ExtractedLead,
  UnansweredQuestion
} from "@/lib/types";

export const demoUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@vaani.local"
};

export const demoAgent: Agent = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: demoUser.id,
  name: "Sales Demo Agent",
  description: "Friendly qualification and follow-up booking assistant.",
  system_prompt:
    "You are a friendly, human-like sales assistant. You answer questions clearly, qualify the lead, explain the product, and try to book a follow-up. Keep responses short, natural, and conversational. Ask one question at a time.",
  first_message: "Hi, this is Vaani. I can help answer questions and book a quick follow-up.",
  language: "en-IN",
  voice_id: "gemini-natural-female",
  model_config: {
    model: "gemini-2.0-flash",
    temperature: 0.4,
    maxCallDurationSeconds: 600,
    silenceTimeoutMs: 900,
    interruptionEnabled: true
  },
  latency_config: {
    mode: "ultra-low",
    partialTranscriptPrefetch: true,
    phraseLevelTts: true,
    targetPerceivedLatencyMs: 300
  },
  cost_config: {
    mode: "economy",
    maxEstimatedInrPerMinute: 3
  },
  vobiz_config: {
    phoneNumber: "+91XXXXXXXXXX",
    sipTrunk: "TODO: configure Vobiz SIP trunk"
  },
  created_at: new Date(Date.now() - 86400000).toISOString(),
  updated_at: new Date().toISOString()
};

export const demoAgents: Agent[] = [demoAgent];

export const demoCalls: Call[] = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    user_id: demoUser.id,
    agent_id: demoAgent.id,
    phone_number: "+919876543210",
    direction: "outbound",
    status: "completed",
    livekit_room_name: "call_22222222",
    vobiz_call_id: "demo-vobiz-call",
    started_at: new Date(Date.now() - 3600000).toISOString(),
    ended_at: new Date(Date.now() - 3420000).toISOString(),
    duration_seconds: 180,
    recording_url: null,
    total_cost_estimate: 7.2,
    summary: "Qualified buyer interested in a WhatsApp voice automation demo.",
    agents: {
      name: demoAgent.name,
      voice_id: demoAgent.voice_id
    }
  }
];

export const demoMessages: CallMessage[] = [
  {
    id: "33333333-3333-4333-8333-333333333331",
    call_id: demoCalls[0].id,
    agent_id: demoAgent.id,
    role: "assistant",
    content: "Hi, this is Vaani. I can help with your voice automation questions.",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    latency_ms: 214
  },
  {
    id: "33333333-3333-4333-8333-333333333332",
    call_id: demoCalls[0].id,
    agent_id: demoAgent.id,
    role: "user",
    content: "We need an AI caller for inbound sales and follow-up scheduling.",
    timestamp: new Date(Date.now() - 3570000).toISOString(),
    latency_ms: 96
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    call_id: demoCalls[0].id,
    agent_id: demoAgent.id,
    role: "assistant",
    content: "Got it. How many calls do you expect on a normal day?",
    timestamp: new Date(Date.now() - 3568000).toISOString(),
    latency_ms: 248
  }
];

export const demoMetrics: CallMetric = {
  id: "44444444-4444-4444-8444-444444444444",
  call_id: demoCalls[0].id,
  speech_end_to_transcript_ms: 86,
  transcript_to_first_token_ms: 78,
  first_token_to_first_audio_ms: 92,
  total_response_latency_ms: 256,
  interruption_count: 1,
  average_response_latency_ms: 274,
  estimated_cost: 7.2,
  created_at: new Date().toISOString()
};

export const demoInsight: CallInsight = {
  id: "55555555-5555-4555-8555-555555555555",
  call_id: demoCalls[0].id,
  agent_id: demoAgent.id,
  intent: "evaluate_ai_voice_agent",
  sentiment: "positive",
  outcome: "follow_up_needed",
  objections: ["Needs Vobiz number confirmation"],
  questions: ["Can it handle Malayalam and English mixed speech?"],
  answers: ["Yes, configure language as mixed and keep prompts short."],
  follow_up_required: true,
  extracted_data: {
    product: "AI sales caller",
    next_step: "Book product walkthrough"
  },
  created_at: new Date().toISOString()
};

export const demoKnowledgeFiles: AgentKnowledgeFile[] = [
  {
    id: "66666666-6666-4666-8666-666666666666",
    agent_id: demoAgent.id,
    user_id: demoUser.id,
    filename: "sales-playbook.pdf",
    file_type: "application/pdf",
    storage_path: "demo/sales-playbook.pdf",
    status: "ready",
    created_at: new Date(Date.now() - 7200000).toISOString()
  }
];

export const demoLearningEvents: AgentLearningEvent[] = [
  {
    id: "77777777-7777-4777-8777-777777777777",
    agent_id: demoAgent.id,
    source_call_id: demoCalls[0].id,
    suggested_learning: "When callers mention WhatsApp follow-ups, ask whether they need CRM sync before pricing.",
    reason: "Repeated buying signal in sales calls.",
    confidence_score: 0.82,
    status: "pending",
    created_at: new Date().toISOString()
  }
];

export const demoMemory: AgentMemory[] = [
  {
    id: "88888888-8888-4888-8888-888888888888",
    agent_id: demoAgent.id,
    source_call_id: demoCalls[0].id,
    content: "Lead qualification should capture call volume, language mix, CRM, and follow-up expectation.",
    category: "sales_qualification",
    confidence_score: 0.91,
    approved_by_user: true,
    created_at: new Date().toISOString()
  }
];

export const demoLeads: ExtractedLead[] = [
  {
    id: "99999999-9999-4999-8999-999999999999",
    call_id: demoCalls[0].id,
    agent_id: demoAgent.id,
    name: "Demo Lead",
    phone: "+919876543210",
    email: "buyer@example.com",
    company: "Acme Growth",
    requirement: "Inbound AI voice agent with WhatsApp follow-up.",
    budget: "₹50k/month",
    timeline: "This month",
    status: "new",
    custom_fields: {
      language_mix: "English + Malayalam"
    },
    created_at: new Date().toISOString()
  }
];

export const demoUnansweredQuestions: UnansweredQuestion[] = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    call_id: demoCalls[0].id,
    agent_id: demoAgent.id,
    question: "Can Vobiz pass exact SIP bridge metadata into LiveKit?",
    attempted_answer: "It depends on the Vobiz webhook payload and SIP trunk mapping.",
    reason_failed: "Vobiz API details are not configured yet.",
    status: "open",
    created_at: new Date().toISOString()
  }
];
