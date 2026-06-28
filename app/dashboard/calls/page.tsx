import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { searchCalls } from "@/lib/data";
import { requireCurrentUser } from "@/lib/supabase/server";
import { formatDuration, formatInr } from "@/lib/utils";
import type { CallStatus } from "@/lib/types";

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

export default async function CallsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireCurrentUser();
  const { q = "" } = await searchParams;
  const calls = await searchCalls(user.id, q);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Call history</CardTitle>
        <CardDescription>Search by caller, agent, call summary, transcript notes, lead details, or outcome.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="q">Search calls</FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="q" name="q" className="pl-9" defaultValue={q} placeholder="Caller, outcome, lead name, question..." />
              </div>
            </Field>
          </FieldGroup>
        </form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Caller</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Spend</TableHead>
              <TableHead>Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calls.map((call) => (
              <TableRow key={call.id}>
                <TableCell>
                  <Link className="font-medium text-primary" href={`/dashboard/calls/${call.id}`}>
                    {call.phone_number}
                  </Link>
                </TableCell>
                <TableCell>{call.agents?.name || "Agent"}</TableCell>
                <TableCell className="capitalize">{call.direction}</TableCell>
                <TableCell>
                  <Badge variant={callStatusVariant(call.status)}>{callStatusLabel(call.status)}</Badge>
                </TableCell>
                <TableCell>{formatDuration(call.duration_seconds)}</TableCell>
                <TableCell>{formatInr(Number(call.total_cost_estimate || 0))}</TableCell>
                <TableCell className="max-w-sm text-muted-foreground">{call.summary || "Summary will appear after processing."}</TableCell>
              </TableRow>
            ))}
            {!calls.length ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  {q ? "No calls matched this search." : "No calls yet. Completed conversations will appear here with transcripts and summaries."}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
