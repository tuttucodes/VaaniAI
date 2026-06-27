export type CostMode = "economy" | "balanced" | "quality";
export type LatencyMode = "ultra-low" | "balanced" | "quality";
export type CallDirection = "inbound" | "outbound";
export type CallStatus = "queued" | "ringing" | "in_progress" | "completed" | "failed" | "canceled";
export type KnowledgeStatus = "uploaded" | "processing" | "ready" | "failed";
export type LearningStatus = "pending" | "approved" | "rejected";

export interface Agent {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  first_message: string | null;
  language: string;
  voice_id: string;
  model_config: Record<string, unknown>;
  latency_config: Record<string, unknown>;
  cost_config: Record<string, unknown>;
  vobiz_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentKnowledgeFile {
  id: string;
  agent_id: string;
  user_id: string;
  filename: string;
  file_type: string;
  storage_path: string;
  status: KnowledgeStatus;
  created_at: string;
}

export interface AgentKnowledgeChunk {
  id: string;
  agent_id: string;
  file_id: string;
  content: string;
  summary: string | null;
  keywords: string[] | null;
  token_count: number | null;
  source_reference: string | null;
  similarity?: number;
  keyword_score?: number;
}

export interface Call {
  id: string;
  user_id: string;
  agent_id: string;
  phone_number: string;
  direction: CallDirection;
  status: CallStatus;
  livekit_room_name: string | null;
  vobiz_call_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  total_cost_estimate: number | null;
  summary: string | null;
  agents?: Pick<Agent, "name" | "voice_id"> | null;
}

export interface CallMessage {
  id: string;
  call_id: string;
  agent_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
  latency_ms: number | null;
}

export interface CallMetric {
  id: string;
  call_id: string;
  speech_end_to_transcript_ms: number | null;
  transcript_to_first_token_ms: number | null;
  first_token_to_first_audio_ms: number | null;
  total_response_latency_ms: number | null;
  interruption_count: number | null;
  average_response_latency_ms: number | null;
  estimated_cost: number | null;
  created_at: string;
}

export interface CallInsight {
  id: string;
  call_id: string;
  agent_id: string;
  intent: string | null;
  sentiment: string | null;
  outcome: string | null;
  objections: unknown;
  questions: unknown;
  answers: unknown;
  follow_up_required: boolean;
  extracted_data: unknown;
  created_at: string;
}

export interface ExtractedLead {
  id: string;
  call_id: string;
  agent_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  requirement: string | null;
  budget: string | null;
  timeline: string | null;
  status: string | null;
  custom_fields: unknown;
  created_at: string;
}

export interface AgentMemory {
  id: string;
  agent_id: string;
  source_call_id: string | null;
  content: string;
  category: string | null;
  confidence_score: number | null;
  approved_by_user: boolean;
  created_at: string;
}

export interface AgentLearningEvent {
  id: string;
  agent_id: string;
  source_call_id: string | null;
  suggested_learning: string;
  reason: string | null;
  confidence_score: number | null;
  status: LearningStatus;
  created_at: string;
}

export interface UnansweredQuestion {
  id: string;
  call_id: string;
  agent_id: string;
  question: string;
  attempted_answer: string | null;
  reason_failed: string | null;
  status: string;
  created_at: string;
}
