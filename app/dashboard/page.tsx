import Link from "next/link";
import { ArrowRight, BrainCircuit, Database, PhoneCall } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { StatusPill } from "@/components/dashboard/status-pill";
import { Waveform } from "@/components/dashboard/waveform";
import { listAgents, listCalls, listKnowledgeFiles, listLearningEvents } from "@/lib/data";
import { requireCurrentUser } from "@/lib/supabase/server";
import { formatDuration, formatInr } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const [agents, calls, knowledgeFiles, learningEvents] = await Promise.all([
    listAgents(user.id),
    listCalls(user.id),
    listKnowledgeFiles(user.id),
    listLearningEvents(user.id)
  ]);

  const completedCalls = calls.filter((call) => call.status === "completed");
  const avgLatency = 274;
  const totalCost = calls.reduce((sum, call) => sum + Number(call.total_cost_estimate || 0), 0);

  return (
    <>
      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-2xl">Voice operations</CardTitle>
            <CardDescription>Create agents, stream calls, retrieve knowledge, and approve learnings.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[1fr_260px]">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border p-4">
                <BrainCircuit className="mb-3 text-primary" />
                <div className="text-2xl font-semibold">{agents.length}</div>
                <div className="text-sm text-muted-foreground">Agents</div>
              </div>
              <div className="rounded-md border p-4">
                <PhoneCall className="mb-3 text-primary" />
                <div className="text-2xl font-semibold">{calls.length}</div>
                <div className="text-sm text-muted-foreground">Calls stored</div>
              </div>
              <div className="rounded-md border p-4">
                <Database className="mb-3 text-primary" />
                <div className="text-2xl font-semibold">{knowledgeFiles.length}</div>
                <div className="text-sm text-muted-foreground">Knowledge files</div>
              </div>
            </div>
            <div className="rounded-md border bg-secondary p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Live audio path</div>
                  <div className="text-xs text-muted-foreground">Caller audio to spoken response</div>
                </div>
                <Badge variant="secondary">MVP</Badge>
              </div>
              <Waveform className="my-5" />
              <Button asChild>
                <Link href="/dashboard/agents/new">
                  New agent
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Learning queue</CardTitle>
            <CardDescription>User-approved memory only.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {learningEvents.slice(0, 3).map((event) => (
              <div key={event.id} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <StatusPill status={event.status} />
                  <span className="text-xs text-muted-foreground">{Math.round(Number(event.confidence_score || 0) * 100)}%</span>
                </div>
                <p className="text-sm">{event.suggested_learning}</p>
              </div>
            ))}
            {!learningEvents.length ? <p className="text-sm text-muted-foreground">No suggested learnings yet.</p> : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricTile title="Avg response latency" value={`${avgLatency} ms`} detail="Speech end to first audio target: under 300 ms" progress={91} />
        <MetricTile title="Estimated spend" value={formatInr(totalCost)} detail="Economy mode keeps prompts and context compact" progress={42} />
        <MetricTile title="Completed calls" value={String(completedCalls.length)} detail="Post-call insights run after hangup" progress={65} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recent calls</CardTitle>
          <CardDescription>Transcript, cost, latency, and insights are linked to every call.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phone</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.slice(0, 6).map((call) => (
                <TableRow key={call.id}>
                  <TableCell>{call.phone_number}</TableCell>
                  <TableCell>{call.agents?.name || agents.find((agent) => agent.id === call.agent_id)?.name || "Agent"}</TableCell>
                  <TableCell>
                    <StatusPill status={call.status} />
                  </TableCell>
                  <TableCell>{formatDuration(call.duration_seconds)}</TableCell>
                  <TableCell>{formatInr(Number(call.total_cost_estimate || 0))}</TableCell>
                  <TableCell>
                    <Link className="text-sm font-medium text-primary" href={`/dashboard/calls/${call.id}`}>
                      Open
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
