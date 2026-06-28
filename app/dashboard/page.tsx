import Link from "next/link";
import { ArrowRight, BrainCircuit, PhoneCall, UserRoundCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { StatusPill } from "@/components/dashboard/status-pill";
import { Waveform } from "@/components/dashboard/waveform";
import { listAgents, listCalls, listKnowledgeFiles, listLeads, listLearningEvents } from "@/lib/data";
import { requireCurrentUser } from "@/lib/supabase/server";
import type { CallStatus } from "@/lib/types";
import { formatDuration, formatInr } from "@/lib/utils";

function callStatusLabel(status: CallStatus) {
  const labels: Record<CallStatus, string> = {
    queued: "Queued",
    ringing: "Ringing",
    in_progress: "In progress",
    completed: "Completed",
    failed: "Needs review",
    canceled: "Canceled"
  };

  return labels[status] || status;
}

function callStatusVariant(status: CallStatus) {
  if (status === "completed") return "default";
  if (status === "failed") return "destructive";
  if (status === "queued" || status === "ringing" || status === "in_progress") return "secondary";
  return "outline";
}

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const [agents, calls, knowledgeFiles, leads, learningEvents] = await Promise.all([
    listAgents(user.id),
    listCalls(user.id),
    listKnowledgeFiles(user.id),
    listLeads(user.id),
    listLearningEvents(user.id)
  ]);

  const completedCalls = calls.filter((call) => call.status === "completed");
  const pendingImprovements = learningEvents.filter((event) => event.status === "pending");
  const totalCost = calls.reduce((sum, call) => sum + Number(call.total_cost_estimate || 0), 0);
  const activeAgents = agents.length;

  return (
    <>
      <section className="grid gap-4 lg:grid-cols-[1.45fr_0.8fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-2xl leading-tight">Business call desk</CardTitle>
                <CardDescription>See calls, leads, and answer improvements in one simple view.</CardDescription>
              </div>
              <Badge variant="secondary" className="w-fit">
                Client demo ready
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[1fr_260px]">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border bg-background p-4">
                <BrainCircuit className="mb-3 text-primary" />
                <div className="text-2xl font-semibold">{activeAgents}</div>
                <div className="text-sm text-muted-foreground">Agents ready</div>
              </div>
              <div className="rounded-md border bg-background p-4">
                <PhoneCall className="mb-3 text-primary" />
                <div className="text-2xl font-semibold">{calls.length}</div>
                <div className="text-sm text-muted-foreground">Calls logged</div>
              </div>
              <div className="rounded-md border bg-background p-4">
                <UserRoundCheck className="mb-3 text-primary" />
                <div className="text-2xl font-semibold">{leads.length}</div>
                <div className="text-sm text-muted-foreground">Leads captured</div>
              </div>
            </div>
            <div className="rounded-md border bg-secondary p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Ready to answer callers</div>
                  <div className="text-xs text-muted-foreground">Set up a voice agent and connect knowledge</div>
                </div>
                <Badge variant="secondary">Live</Badge>
              </div>
              <Waveform className="my-5" />
              <Button asChild>
                <Link href="/dashboard/agents/new">
                  Add agent
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Learning queue</CardTitle>
            <CardDescription>Approve new facts before agents use them on calls.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {pendingImprovements.slice(0, 3).map((event) => (
              <div key={event.id} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <StatusPill status={event.status} />
                  <span className="text-xs text-muted-foreground">{Math.round(Number(event.confidence_score || 0) * 100)}%</span>
                </div>
                <p className="text-sm">{event.suggested_learning}</p>
              </div>
            ))}
            {!pendingImprovements.length ? <p className="text-sm text-muted-foreground">No pending improvements. New suggestions appear after calls.</p> : null}
            <Button asChild variant="outline" className="mt-1 justify-between">
              <Link href="/dashboard/memory">
                Review learning
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricTile title="Answered calls" value={String(completedCalls.length)} detail="Completed conversations with notes and next steps" progress={65} />
        <MetricTile title="Estimated spend" value={formatInr(totalCost)} detail="Approximate running cost for the logged calls" progress={42} />
        <MetricTile title="Knowledge added" value={String(knowledgeFiles.length)} detail="Files agents can use when answering questions" progress={78} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recent calls</CardTitle>
          <CardDescription>Open any call to review the transcript, summary, and follow-up details.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Caller</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Spend</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.slice(0, 6).map((call) => (
                <TableRow key={call.id}>
                  <TableCell className="font-medium">{call.phone_number}</TableCell>
                  <TableCell>{call.agents?.name || agents.find((agent) => agent.id === call.agent_id)?.name || "Agent"}</TableCell>
                  <TableCell>
                    <Badge variant={callStatusVariant(call.status)}>{callStatusLabel(call.status)}</Badge>
                  </TableCell>
                  <TableCell>{formatDuration(call.duration_seconds)}</TableCell>
                  <TableCell className="max-w-md text-muted-foreground">{call.summary || "Summary will appear after the call is processed."}</TableCell>
                  <TableCell>{formatInr(Number(call.total_cost_estimate || 0))}</TableCell>
                  <TableCell>
                    <Link className="text-sm font-medium text-primary" href={`/dashboard/calls/${call.id}`}>
                      Review
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {!calls.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No calls yet. Once an agent starts answering, calls and transcripts will appear here.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
