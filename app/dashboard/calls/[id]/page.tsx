import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { StatusPill } from "@/components/dashboard/status-pill";
import { CallDataActions } from "@/components/forms/call-data-actions";
import { getCall, getCallInsights, getCallMetrics, listCallMessages } from "@/lib/data";
import { requireCurrentUser } from "@/lib/supabase/server";
import { formatDuration, formatInr } from "@/lib/utils";

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const call = await getCall(user.id, id);
  if (!call) notFound();

  const [messages, metrics, insights] = await Promise.all([
    listCallMessages(user.id, id),
    getCallMetrics(user.id, id),
    getCallInsights(user.id, id)
  ]);

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-4">
        <MetricTile title="Status" value={call.status.replaceAll("_", " ")} detail={`${call.direction} call`} progress={call.status === "completed" ? 100 : 45} />
        <MetricTile title="Duration" value={formatDuration(call.duration_seconds)} detail={call.phone_number} progress={50} />
        <MetricTile title="Avg latency" value={`${metrics?.average_response_latency_ms || 0} ms`} detail="Target under 300 ms" progress={metrics?.average_response_latency_ms ? 100 - Math.min(100, metrics.average_response_latency_ms / 6) : 0} />
        <MetricTile title="Cost" value={formatInr(Number(call.total_cost_estimate || metrics?.estimated_cost || 0))} detail="Estimated live-call spend" progress={35} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Live transcript</CardTitle>
                <CardDescription>Messages are stored with per-turn latency and linked knowledge references.</CardDescription>
              </div>
              <div className="flex flex-col items-end gap-3">
                <StatusPill status={call.status} />
                <CallDataActions callId={call.id} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex max-h-[620px] flex-col gap-3 overflow-auto">
            {call.summary ? <p className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">{call.summary}</p> : null}
            {messages.map((message) => (
              <div key={message.id} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Badge variant={message.role === "assistant" ? "default" : "secondary"}>{message.role}</Badge>
                  <span className="text-xs text-muted-foreground">{message.latency_ms ? `${message.latency_ms} ms` : ""}</span>
                </div>
                <p className="text-sm leading-relaxed">{message.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Insights</CardTitle>
              <CardDescription>Generated after hangup to keep live calls cheap.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Intent</span>
                <span className="font-medium">{insights?.intent || "pending"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Sentiment</span>
                <span className="font-medium">{insights?.sentiment || "pending"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Outcome</span>
                <span className="font-medium">{insights?.outcome || "pending"}</span>
              </div>
              <div className="rounded-md border p-3">
                <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">Extracted data</div>
                <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(insights?.extracted_data || {}, null, 2)}</pre>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Latency breakdown</CardTitle>
              <CardDescription>Measured per call turn.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <span>STT</span>
                <span>{metrics?.speech_end_to_transcript_ms || 0} ms</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>LLM first token</span>
                <span>{metrics?.transcript_to_first_token_ms || 0} ms</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>TTS first audio</span>
                <span>{metrics?.first_token_to_first_audio_ms || 0} ms</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Interruptions</span>
                <span>{metrics?.interruption_count || 0}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
