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
          <CardTitle>Suggested learnings</CardTitle>
          <CardDescription>The agent never overwrites prompts or memory without approval.</CardDescription>
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
                  <TableCell className="max-w-2xl">{event.suggested_learning}</TableCell>
                  <TableCell>
                    <StatusPill status={event.status} />
                  </TableCell>
                  <TableCell>{Math.round(Number(event.confidence_score || 0) * 100)}%</TableCell>
                  <TableCell>{event.status === "pending" ? <MemoryActions learningId={event.id} /> : null}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Approved memory</CardTitle>
            <CardDescription>Reusable learnings linked to original source calls.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {memory.map((item) => (
              <div key={item.id} className="rounded-md border p-3">
                <div className="mb-2 flex justify-between gap-3 text-xs text-muted-foreground">
                  <span>{item.category || "memory"}</span>
                  <span>{Math.round(Number(item.confidence_score || 0) * 100)}%</span>
                </div>
                <p className="text-sm">{item.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Unanswered questions</CardTitle>
            <CardDescription>Knowledge gaps to close with better files or memory.</CardDescription>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
