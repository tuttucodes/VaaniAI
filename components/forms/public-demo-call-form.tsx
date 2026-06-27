"use client";

import { useState, useTransition } from "react";
import { Building2, CalendarClock, Headset, Home, PhoneCall, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { demoScenarios, type DemoScenarioId } from "@/lib/public-demo/scenarios";
import { cn } from "@/lib/utils";

const icons: Record<DemoScenarioId, typeof CalendarClock> = {
  dental: CalendarClock,
  real_estate: Home,
  restaurant: Utensils
};

export function PublicDemoCallForm() {
  const [scenario, setScenario] = useState<DemoScenarioId>("dental");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/public/demo-call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: String(formData.get("name") || ""),
          phone_number: String(formData.get("phone_number") || ""),
          scenario,
          use_case: String(formData.get("use_case") || "")
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error || "Could not start call.");
        return;
      }
      setMessage(`Call queued. Dashboard call id: ${payload.call_id}`);
    });
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit(new FormData(event.currentTarget));
      }}
    >
      <div className="grid gap-3 md:grid-cols-3">
        {demoScenarios.map((item) => {
          const Icon = icons[item.id];
          const selected = scenario === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setScenario(item.id)}
              className={cn(
                "group rounded-md border p-4 text-left transition-colors",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/50"
              )}
            >
              <Icon className="mb-6 size-5" />
              <div className="text-sm font-semibold">{item.title}</div>
              <p className={cn("mt-2 text-xs leading-5", selected ? "text-primary-foreground/82" : "text-muted-foreground")}>
                {item.subtitle}
              </p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Your name
          <Input name="name" placeholder="Rahul" required />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Phone number
          <Input name="phone_number" placeholder="+919876543210" required />
        </label>
      </div>

      <label className="grid gap-2 text-sm font-medium">
        What should the agent help with?
        <Textarea
          name="use_case"
          className="min-h-28"
          placeholder="Example: I want to book a dental appointment tomorrow evening for tooth sensitivity."
          required
        />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" disabled={isPending} className="w-full sm:w-auto">
          <PhoneCall data-icon="inline-start" />
          {isPending ? "Calling..." : "Call me now"}
        </Button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </form>
  );
}

export function DemoSignalPanel() {
  return (
    <div className="relative overflow-hidden rounded-md border bg-card p-5 shadow-panel">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Live call path</div>
          <div className="text-xs text-muted-foreground">Vobiz voice XML today, LiveKit SIP worker for realtime mode</div>
        </div>
        <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Headset className="size-5" />
        </div>
      </div>
      <div className="grid gap-3">
        {["Call queued", "Answer XML", "Speech gather", "Agent response", "Transcript saved"].map((step, index) => (
          <div key={step} className="flex items-center gap-3 rounded-md border bg-background p-3">
            <div className="flex size-7 items-center justify-center rounded-md bg-secondary text-xs font-semibold">{index + 1}</div>
            <div className="text-sm">{step}</div>
            <div className="ml-auto h-2 w-16 rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, 32 + index * 15)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
        For production realtime calls, run the LiveKit agent worker as an always-on service beside this web app.
      </div>
      <Building2 className="absolute -bottom-6 -right-5 size-28 text-primary/10" />
    </div>
  );
}

