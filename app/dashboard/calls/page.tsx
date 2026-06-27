import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill } from "@/components/dashboard/status-pill";
import { listCalls } from "@/lib/data";
import { requireCurrentUser } from "@/lib/supabase/server";
import { formatDuration, formatInr } from "@/lib/utils";

export default async function CallsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireCurrentUser();
  const { q = "" } = await searchParams;
  const calls = await listCalls(user.id);
  const filtered = q
    ? calls.filter((call) =>
        [call.phone_number, call.summary, call.status, call.agents?.name].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(q.toLowerCase())
        )
      )
    : calls;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calls</CardTitle>
        <CardDescription>Search by phone, agent, status, or summary. Transcript search is available through stored messages.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="q">Search calls</FieldLabel>
              <Input id="q" name="q" defaultValue={q} placeholder="phone, outcome, sentiment, lead name..." />
            </Field>
          </FieldGroup>
        </form>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Phone</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((call) => (
              <TableRow key={call.id}>
                <TableCell>
                  <Link className="font-medium text-primary" href={`/dashboard/calls/${call.id}`}>
                    {call.phone_number}
                  </Link>
                </TableCell>
                <TableCell>{call.agents?.name || "Agent"}</TableCell>
                <TableCell>{call.direction}</TableCell>
                <TableCell>
                  <StatusPill status={call.status} />
                </TableCell>
                <TableCell>{formatDuration(call.duration_seconds)}</TableCell>
                <TableCell>{formatInr(Number(call.total_cost_estimate || 0))}</TableCell>
                <TableCell className="max-w-sm">{call.summary || "No summary yet"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
