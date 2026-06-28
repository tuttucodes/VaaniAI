"use client";

import { useRef, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Agent, CostMode, LatencyMode } from "@/lib/types";

function configValue<T>(source: Record<string, unknown>, key: string, fallback: T): T {
  return (source?.[key] as T | undefined) ?? fallback;
}

export function AgentForm({ agent }: { agent?: Agent }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isImproving, setIsImproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [costMode, setCostMode] = useState<CostMode>((agent?.cost_config?.mode as CostMode) || "economy");
  const [latencyMode, setLatencyMode] = useState<LatencyMode>((agent?.latency_config?.mode as LatencyMode) || "ultra-low");
  const [interruptionEnabled, setInterruptionEnabled] = useState(
    configValue(agent?.model_config || {}, "interruptionEnabled", true)
  );
  const [knowledgeEnabled, setKnowledgeEnabled] = useState(
    configValue(agent?.model_config || {}, "knowledgeRetrievalEnabled", true)
  );
  const [fillersEnabled, setFillersEnabled] = useState(configValue(agent?.model_config || {}, "humanFillersEnabled", true));

  function setFormField(name: string, value: string) {
    const field = formRef.current?.elements.namedItem(name);
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  async function improveAgent() {
    if (!formRef.current) return;
    setError(null);
    setIsImproving(true);

    const formData = new FormData(formRef.current);
    const body = {
      name: String(formData.get("name") || ""),
      description: String(formData.get("description") || ""),
      system_prompt: String(formData.get("system_prompt") || ""),
      first_message: String(formData.get("first_message") || ""),
      language: "multilingual-IN",
      end_call_rules: String(formData.get("end_call_rules") || "")
    };

    try {
      const response = await fetch("/api/agents/improve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || "Unable to improve agent");
        return;
      }

      setFormField("description", payload.description || body.description);
      setFormField("system_prompt", payload.system_prompt || body.system_prompt);
      setFormField("first_message", payload.first_message || body.first_message);
      setFormField("end_call_rules", payload.end_call_rules || body.end_call_rules);
    } catch {
      setError("Unable to improve agent right now");
    } finally {
      setIsImproving(false);
    }
  }

  function saveAgent(formData: FormData) {
    setError(null);
    const body = {
      name: String(formData.get("name") || ""),
      description: String(formData.get("description") || ""),
      system_prompt: String(formData.get("system_prompt") || ""),
      first_message: String(formData.get("first_message") || ""),
      language: "multilingual-IN",
      voice_id: String(formData.get("voice_id") || "gemini-natural-female"),
      temperature: Number(formData.get("temperature") || 0.4),
      max_call_duration_seconds: Number(formData.get("max_call_duration_seconds") || 600),
      silence_timeout_ms: Number(formData.get("silence_timeout_ms") || 900),
      interruption_enabled: interruptionEnabled,
      vobiz_phone_number: String(formData.get("vobiz_phone_number") || ""),
      vobiz_sip_config: String(formData.get("vobiz_sip_config") || ""),
      cost_mode: costMode,
      latency_mode: latencyMode,
      knowledge_retrieval_enabled: knowledgeEnabled,
      human_fillers_enabled: fillersEnabled,
      end_call_rules: String(formData.get("end_call_rules") || "")
    };

    startTransition(async () => {
      const response = await fetch(agent ? `/api/agents/${agent.id}` : "/api/agents/create", {
        method: agent ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || "Unable to save agent");
        return;
      }
      router.push(`/dashboard/agents/${payload.agent.id}`);
      router.refresh();
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault();
        saveAgent(new FormData(event.currentTarget));
      }}
    >
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>{agent ? "Agent configuration" : "Create AI voice agent"}</CardTitle>
              <CardDescription>Keep prompts compact and runtime controls tuned for phone-call latency.</CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={improveAgent} disabled={isImproving || isPending}>
              <Sparkles aria-hidden="true" />
              {isImproving ? "Improving..." : "Improve with AI"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 lg:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="name">Agent name</FieldLabel>
                <Input id="name" name="name" defaultValue={agent?.name || "Sales Demo Agent"} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="language_display">Language handling</FieldLabel>
                <Input id="language_display" value="Multilingual auto-detect" readOnly />
                <input type="hidden" name="language" value="multilingual-IN" />
                <FieldDescription>English, Malayalam, Tamil, Telugu, Kannada, Hindi, and mixed speech.</FieldDescription>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Input id="description" name="description" defaultValue={agent?.description || ""} />
            </Field>
            <Field>
              <FieldLabel htmlFor="system_prompt">System prompt / context</FieldLabel>
              <Textarea
                id="system_prompt"
                name="system_prompt"
                className="min-h-44"
                defaultValue={
                  agent?.system_prompt ||
                  "You are a friendly, human-like sales assistant. You answer questions clearly, qualify the lead, explain the product, and try to book a follow-up. Keep responses short, natural, and conversational. Ask one question at a time."
                }
                required
              />
              <FieldDescription>Use clear business rules. Uploaded knowledge and approved memory are injected separately.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="first_message">First message</FieldLabel>
              <Input
                id="first_message"
                name="first_message"
                defaultValue={agent?.first_message || "Hi, this is Vaani. I can help answer questions and book a quick follow-up."}
              />
            </Field>
            <div className="grid gap-4 lg:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="voice_id">Voice</FieldLabel>
                <Input id="voice_id" name="voice_id" defaultValue={agent?.voice_id || "gemini-natural-female"} />
              </Field>
              <Field>
                <FieldLabel htmlFor="temperature">Temperature</FieldLabel>
                <Input
                  id="temperature"
                  name="temperature"
                  type="number"
                  step="0.1"
                  min="0"
                  max="1.5"
                  defaultValue={String(configValue(agent?.model_config || {}, "temperature", 0.4))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="max_call_duration_seconds">Max call duration</FieldLabel>
                <Input
                  id="max_call_duration_seconds"
                  name="max_call_duration_seconds"
                  type="number"
                  min="30"
                  defaultValue={String(configValue(agent?.model_config || {}, "maxCallDurationSeconds", 600))}
                />
              </Field>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="silence_timeout_ms">Silence timeout ms</FieldLabel>
                <Input
                  id="silence_timeout_ms"
                  name="silence_timeout_ms"
                  type="number"
                  min="300"
                  defaultValue={String(configValue(agent?.model_config || {}, "silenceTimeoutMs", 900))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="vobiz_phone_number">Phone number / voice route</FieldLabel>
                <Input
                  id="vobiz_phone_number"
                  name="vobiz_phone_number"
                  defaultValue={String(agent?.vobiz_config?.phoneNumber || "")}
                  placeholder="+91..."
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="vobiz_sip_config">Voice routing config or notes</FieldLabel>
              <Textarea
                id="vobiz_sip_config"
                name="vobiz_sip_config"
                defaultValue={String(agent?.vobiz_config?.sipConfig || "")}
                placeholder="Add routing details, fallback notes, or leave blank for the workspace default."
              />
            </Field>
            <div className="grid gap-4 lg:grid-cols-2">
              <FieldSet>
                <FieldLegend>Cost mode</FieldLegend>
                <ToggleGroup value={costMode} onValueChange={(value) => setCostMode(value as CostMode)} name="cost mode">
                  <ToggleGroupItem value="economy">Economy</ToggleGroupItem>
                  <ToggleGroupItem value="balanced">Balanced</ToggleGroupItem>
                  <ToggleGroupItem value="quality">Quality</ToggleGroupItem>
                </ToggleGroup>
              </FieldSet>
              <FieldSet>
                <FieldLegend>Latency mode</FieldLegend>
                <ToggleGroup value={latencyMode} onValueChange={(value) => setLatencyMode(value as LatencyMode)} name="latency mode">
                  <ToggleGroupItem value="ultra-low">Ultra-low</ToggleGroupItem>
                  <ToggleGroupItem value="balanced">Balanced</ToggleGroupItem>
                  <ToggleGroupItem value="quality">Quality</ToggleGroupItem>
                </ToggleGroup>
              </FieldSet>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <Field orientation="horizontal">
                <FieldLabel>Barge-in</FieldLabel>
                <Switch checked={interruptionEnabled} onChange={(event) => setInterruptionEnabled(event.target.checked)} />
              </Field>
              <Field orientation="horizontal">
                <FieldLabel>Knowledge retrieval</FieldLabel>
                <Switch checked={knowledgeEnabled} onChange={(event) => setKnowledgeEnabled(event.target.checked)} />
              </Field>
              <Field orientation="horizontal">
                <FieldLabel>Human fillers</FieldLabel>
                <Switch checked={fillersEnabled} onChange={(event) => setFillersEnabled(event.target.checked)} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="end_call_rules">End-call rules</FieldLabel>
              <Textarea
                id="end_call_rules"
                name="end_call_rules"
                defaultValue={String(agent?.model_config?.endCallRules || "")}
                placeholder="End after booking, opt-out, abusive call, or explicit goodbye."
              />
            </Field>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : agent ? "Save changes" : "Create agent"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
