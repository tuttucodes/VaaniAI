import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrowserVoiceDemo } from "@/components/forms/browser-voice-demo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardVoiceLabPage() {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Voice lab</CardTitle>
              <CardDescription>Test the same real-time voice agent engine in the browser before routing it to phone calls.</CardDescription>
            </div>
            <Badge variant="secondary" className="w-fit">
              Live streaming
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Use this for client demos and prompt tuning. The agent speaks first, listens continuously, and mirrors Indian mixed speech.</p>
          <Link href="/dashboard/agents/new" className="inline-flex items-center gap-2 font-medium text-primary">
            Create custom agent
            <ArrowRight className="size-4" />
          </Link>
        </CardContent>
      </Card>
      <BrowserVoiceDemo />
    </div>
  );
}
