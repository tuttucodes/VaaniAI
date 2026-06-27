"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Headset, Home, PhoneCall, Utensils } from "lucide-react";
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
                "group rounded-2xl border p-4 text-left transition-all",
                selected
                  ? "border-[#120a19] bg-[#120a19] text-white shadow-[0_18px_36px_rgba(18,10,25,0.18)]"
                  : "border-black/10 bg-[#fbfbfb] text-[#120a19] hover:border-[#c58be2]"
              )}
            >
              <Icon className={cn("mb-6 size-5", selected ? "text-[#e8b9ff]" : "text-[#8f4ead]")} />
              <div className="text-sm font-semibold">{item.title}</div>
              <p className={cn("mt-2 text-xs leading-5", selected ? "text-white/72" : "text-[#746a7a]")}>
                {item.subtitle}
              </p>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-[#241a2c]">
          Your name
          <Input name="name" placeholder="Rahul" className="h-12 border-black/15 bg-white text-base" required />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#241a2c]">
          Phone number
          <Input name="phone_number" placeholder="+919876543210" className="h-12 border-black/15 bg-white text-base" required />
        </label>
      </div>

      <label className="grid gap-2 text-sm font-semibold text-[#241a2c]">
        What should the agent help with?
        <Textarea
          name="use_case"
          className="min-h-28 border-black/15 bg-white text-base"
          placeholder="Example: I want to book a dental appointment tomorrow evening for tooth sensitivity."
          required
        />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="submit"
          size="lg"
          disabled={isPending}
          className="h-12 w-full rounded-md bg-[#e8b9ff] px-6 font-semibold text-[#120719] shadow-[0_14px_32px_rgba(189,109,232,0.25)] hover:bg-[#dca3fb] sm:w-auto"
        >
          <PhoneCall data-icon="inline-start" />
          {isPending ? "Calling..." : "Call me now"}
        </Button>
        {message ? <p className="text-sm leading-6 text-[#5e5366]">{message}</p> : null}
      </div>
    </form>
  );
}

export function DemoSignalPanel() {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-black/10 bg-white/88 p-6 shadow-[0_24px_70px_rgba(28,14,40,0.12)] backdrop-blur">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-[#120a19]">Call journey</div>
          <div className="text-xs text-[#746a7a]">From dial to transcript in one clean loop</div>
        </div>
        <div className="flex size-10 items-center justify-center rounded-2xl bg-[#120a19] text-[#e8b9ff]">
          <Headset className="size-5" />
        </div>
      </div>
      <div className="grid gap-3">
        {["Call placed", "Caller heard", "Intent understood", "Answer spoken", "Transcript saved"].map((step, index) => (
          <div key={step} className="flex items-center gap-3 rounded-2xl border border-black/10 bg-[#fbfbfb] p-3">
            <div className="flex size-7 items-center justify-center rounded-xl bg-[#efcdfd] text-xs font-semibold text-[#120a19]">{index + 1}</div>
            <div className="text-sm text-[#241a2c]">{step}</div>
            <div className="ml-auto h-2 w-16 rounded-full bg-black/10">
              <div className="h-full rounded-full bg-[#8f4ead]" style={{ width: `${Math.min(100, 32 + index * 15)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 rounded-2xl bg-[#f4e8fb] p-4 text-xs leading-5 text-[#5d5364]">
        Every completed call can produce a transcript, lead summary, unanswered questions, and suggested learnings for approval.
      </div>
    </div>
  );
}
