import { z } from "zod";

export const agentSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().nullable(),
  system_prompt: z.string().min(10).max(12000),
  first_message: z.string().max(1000).optional().nullable(),
  language: z.string().min(2).max(32).default("multilingual-IN"),
  voice_id: z.string().min(2).max(120).default("gemini-natural-female"),
  temperature: z.coerce.number().min(0).max(1.5).default(0.4),
  max_call_duration_seconds: z.coerce.number().int().min(30).max(7200).default(600),
  silence_timeout_ms: z.coerce.number().int().min(300).max(5000).default(900),
  interruption_enabled: z.coerce.boolean().default(true),
  vobiz_phone_number: z.string().max(64).optional().nullable(),
  vobiz_sip_config: z.string().max(2000).optional().nullable(),
  cost_mode: z.enum(["economy", "balanced", "quality"]).default("economy"),
  latency_mode: z.enum(["ultra-low", "balanced", "quality"]).default("ultra-low"),
  knowledge_retrieval_enabled: z.coerce.boolean().default(true),
  human_fillers_enabled: z.coerce.boolean().default(true),
  end_call_rules: z.string().max(2000).optional().nullable()
});

export const agentPatchSchema = agentSchema.partial();

export const agentImproveSchema = z.object({
  name: z.string().max(120).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  system_prompt: z.string().max(12000).optional().nullable(),
  first_message: z.string().max(1000).optional().nullable(),
  language: z.string().max(32).optional().nullable(),
  end_call_rules: z.string().max(2000).optional().nullable()
});

export const startCallSchema = z.object({
  agent_id: z.string().uuid(),
  phone_number: z.string().min(6).max(32).regex(/^[+0-9()\-.\s]+$/, "Use a valid phone number format"),
  direction: z.enum(["outbound", "inbound"]).default("outbound"),
  metadata: z.record(z.unknown()).optional()
});

export const endCallSchema = z.object({
  call_id: z.string().uuid(),
  reason: z.string().max(240).optional()
});

export const liveKitTokenSchema = z.object({
  room_name: z.string().min(3).max(160),
  identity: z.string().min(2).max(160),
  name: z.string().max(160).optional()
});

export const memoryDecisionSchema = z.object({
  learning_id: z.string().uuid(),
  edited_content: z.string().max(3000).optional()
});

export const publicDemoCallSchema = z.object({
  name: z.string().min(2).max(80),
  phone_number: z
    .string()
    .min(8)
    .max(20)
    .regex(/^\+[1-9]\d{7,18}$/, "Use E.164 format, for example +919876543210"),
  scenario: z.enum(["dental", "real_estate", "restaurant", "school"]),
  use_case: z.string().min(3).max(300)
});

export type AgentInput = z.infer<typeof agentSchema>;
export type AgentPatchInput = z.infer<typeof agentPatchSchema>;
export type AgentImproveInput = z.infer<typeof agentImproveSchema>;
export type StartCallInput = z.infer<typeof startCallSchema>;
export type PublicDemoCallInput = z.infer<typeof publicDemoCallSchema>;
