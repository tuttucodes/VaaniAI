import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MemoryActions } from "@/components/forms/memory-actions";
import { StatusPill } from "@/components/dashboard/status-pill";
import { listLearningEvents, listMemory, listUnansweredQuestions } from "@/lib/data";
import { requireCurrentUser } from "@/lib/supabase/server";

export default async function MemoryPage() {
  const user = await requireCurrentUser();
  const [memory, learningEvents, unansweredQuestions] = await Promise.all([
    listMemory(user.id),
    listLearningEvents(user.id),
    listUnansweredQuestions(user.id)
  ]);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Learning queue</CardTitle>
          <CardDescription>Review facts, objections, and better answers before agents use them with callers.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Suggestion</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {learningEvents.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="max-w-2xl">
                    <div>{event.suggested_learning}</div>
                    {event.reason ? <div className="mt-1 text-xs text-muted-foreground">{event.reason}</div> : null}
                  </TableCell>
                  <TableCell>
                    <StatusPill status={event.status} />
                  </TableCell>
                  <TableCell>{Math.round(Number(event.confidence_score || 0) * 100)}%</TableCell>
                  <TableCell>{event.status === "pending" ? <MemoryActions learningId={event.id} /> : null}</TableCell>
                </TableRow>
              ))}
              {!learningEvents.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No suggestions yet. After calls, Vaani will propose improvements for review.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Approved answers</CardTitle>
            <CardDescription>Reusable facts your agents can rely on in future calls.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {memory.map((item) => (
              <div key={item.id} className="rounded-md border p-3">
                <div className="mb-2 flex justify-between gap-3 text-xs text-muted-foreground">
                  <span className="capitalize">{item.category || "general"}</span>
                  <span>{Math.round(Number(item.confidence_score || 0) * 100)}%</span>
                </div>
                <p className="text-sm">{item.content}</p>
              </div>
            ))}
            {!memory.length ? <p className="text-sm text-muted-foreground">Approved learnings will appear here.</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Questions to improve</CardTitle>
            <CardDescription>Gaps found in calls that can be closed with better answers or uploaded files.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {unansweredQuestions.map((question) => (
              <div key={question.id} className="rounded-md border p-3">
                <div className="mb-2">
                  <StatusPill status={question.status} />
                </div>
                <p className="text-sm font-medium">{question.question}</p>
                <p className="mt-2 text-xs text-muted-foreground">{question.reason_failed}</p>
              </div>
            ))}
            {!unansweredQuestions.length ? <p className="text-sm text-muted-foreground">No unresolved caller questions right now.</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
