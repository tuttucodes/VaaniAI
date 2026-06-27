import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { providerStatus } from "@/lib/env";

export default function SettingsPage() {
  const status = providerStatus();
  const checks = [
    { label: "Mode", ok: status.demoMode, env: status.demoMode ? "Demo mode enabled" : "Production runtime" },
    { label: "Workspace data", ok: status.supabase, env: "Auth, database, and private file storage" },
    { label: "AI reasoning", ok: status.gemini, env: "Conversation, summaries, and embeddings" },
    { label: "Realtime audio", ok: status.livekit, env: "Room, token, and stream orchestration" },
    { label: "Phone calling", ok: status.vobiz, env: "Outbound caller ID, callbacks, and recordings" }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>Workspace readiness and calling infrastructure. Secrets stay server-side.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {checks.map((check) => (
          <div key={check.label}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium">{check.label}</div>
                <div className="text-sm text-muted-foreground">{check.env}</div>
              </div>
              <Badge variant={check.ok ? "default" : "secondary"}>{check.ok ? "configured" : "demo mode"}</Badge>
            </div>
            <Separator className="mt-4" />
          </div>
        ))}
        <div className="rounded-md border bg-secondary p-4 text-sm text-muted-foreground">
          Real calls require production secrets, a verified caller number, public callback URLs, and an always-on voice worker for low-latency streaming.
        </div>
      </CardContent>
    </Card>
  );
}
