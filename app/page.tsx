import Link from "next/link";
import { ArrowRight, CheckCircle2, Gauge, Languages, PhoneCall, Sparkles } from "lucide-react";
import { DemoSignalPanel, PublicDemoCallForm } from "@/components/forms/public-demo-call-form";

const languageExamples = [
  {
    title: "Malayalam + English",
    line: "Appointment innu evening available aano? Tooth sensitivity undu.",
    translation: "The caller wants an evening dental appointment and mentions sensitivity."
  },
  {
    title: "Hindi + English",
    line: "Budget confirm karna hai, then site visit schedule kar sakte ho?",
    translation: "The caller wants qualification first, then a visit booking."
  },
  {
    title: "English",
    line: "Can you call me back with the earliest available slot?",
    translation: "The agent captures a callback and next best action."
  }
];

const howItWorks = [
  ["01", "Listen", "Understands caller intent, interruptions, and natural pauses."],
  ["02", "Answer", "Keeps replies short, warm, and focused on one question at a time."],
  ["03", "Remember", "Stores transcripts, leads, outcomes, and user-approved learnings."]
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fbfbfb] text-[#0b0710]">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_82%_4%,rgba(232,191,255,0.55),transparent_34%),radial-gradient(circle_at_8%_84%,rgba(191,239,255,0.55),transparent_30%)]" />

      <header className="sticky top-4 z-20 mx-auto flex max-w-[920px] items-center justify-between rounded-full border border-black/10 bg-white/82 px-4 py-3 shadow-[0_22px_70px_rgba(20,10,30,0.12)] backdrop-blur-md md:px-5">
        <Link href="#top" className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-xl bg-[#13091f] text-sm font-semibold text-white">V</span>
          <span className="text-base font-semibold">Vaani</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-[#33283b] md:flex">
          <Link href="#wedge">The wedge</Link>
          <Link href="#demo">Live demo</Link>
          <Link href="#how">How it works</Link>
          <Link href="#pricing">Pricing</Link>
        </nav>
        <Link
          href="#demo"
          className="rounded-full bg-[#eac7ff] px-4 py-2 text-sm font-semibold text-[#150a1d] shadow-[inset_0_-3px_0_rgba(255,255,255,0.55)] transition hover:bg-[#dfadff]"
        >
          Get a call
        </Link>
      </header>

      <section id="top" className="mx-auto grid max-w-7xl gap-12 px-5 pb-14 pt-20 lg:grid-cols-[0.98fr_1.02fr] lg:items-center lg:pb-20 lg:pt-24">
        <div>
          <div className="inline-flex rounded-full border border-[#b787ca] bg-[#efcdfd] px-3 py-1 text-sm font-medium text-[#160b1d]">
            Voice agents that sound local, fast, and human
          </div>
          <h1 className="mt-8 max-w-3xl font-serif text-5xl font-semibold leading-[0.94] tracking-normal text-black md:text-6xl lg:text-[66px]">
            A phone agent that actually sounds like it is from here.
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-[#3d3345]">
            Vaani answers real phone calls, understands mixed Indian speech, captures leads, and gives your team a clean transcript and follow-up summary after every conversation.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <a
              href="#demo"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#e8b9ff] px-6 text-sm font-semibold text-[#120719] shadow-[0_14px_32px_rgba(189,109,232,0.25)] transition hover:bg-[#dca3fb]"
            >
              Try a live call
              <PhoneCall className="size-4" />
            </a>
            <Link
              href="/dashboard"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-black/15 bg-white px-6 text-sm font-semibold text-[#0b0710] transition hover:bg-black hover:text-white"
            >
              Open dashboard
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/voice-demo"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-black/15 bg-white px-6 text-sm font-semibold text-[#0b0710] transition hover:bg-black hover:text-white"
            >
              Talk in browser
              <Sparkles className="size-4" />
            </Link>
          </div>
          <p className="mt-8 max-w-2xl text-sm leading-6 text-[#706779]">
            Built for receptionist calls, lead qualification, appointment booking, reminders, and service follow-ups where callers switch language mid-sentence.
          </p>
        </div>

        <div className="grid gap-5 lg:pl-6">
          <div className="rounded-[28px] border border-black/10 bg-white/88 p-7 shadow-[0_28px_80px_rgba(30,16,48,0.14)] backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#665b70]">
                <span className="size-2 rounded-full bg-[#51a46d]" />
                Shown live on calls
              </div>
              <span className="border border-black px-3 py-1 font-mono text-xs">Within SLA</span>
            </div>
            <div className="mt-9 flex items-end gap-2">
              <span className="font-serif text-7xl font-semibold leading-none">~412</span>
              <span className="mb-3 text-sm text-[#6b6171]">ms felt</span>
            </div>
            <p className="mt-6 max-w-md text-base leading-7 text-[#352c3d]">
              Replies start quickly, stay conversational, and keep the caller moving without sounding like a menu.
            </p>
            <div className="mt-8 border-t border-black/10 pt-4 text-sm text-[#766d7d]">842 ms measured · voice-to-voice</div>
          </div>

          <DemoSignalPanel />
        </div>
      </section>

      <section id="wedge" className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <div className="text-sm font-semibold text-[#8853a1]">The wedge</div>
          <h2 className="mt-4 max-w-xl font-serif text-4xl font-semibold leading-tight md:text-5xl">Real callers do not speak one language at a time.</h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#4a4051]">
            They start in Malayalam, finish in English, and expect the person on the phone to follow naturally. Vaani mirrors that rhythm while keeping the business outcome clear.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {languageExamples.map((example) => (
            <div key={example.title} className="rounded-2xl border border-black/10 bg-white p-5 shadow-[0_18px_44px_rgba(28,14,40,0.08)]">
              <Languages className="mb-6 size-5 text-[#8f4ead]" />
              <div className="font-semibold">{example.title}</div>
              <p className="mt-4 text-sm leading-6 text-[#201827]">“{example.line}”</p>
              <p className="mt-4 text-xs leading-5 text-[#746a7a]">{example.translation}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="demo" className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <div className="text-sm font-semibold text-[#8853a1]">Live demo</div>
          <h2 className="mt-4 max-w-xl font-serif text-4xl font-semibold leading-tight md:text-5xl">Get a call from a sample agent.</h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#4a4051]">
            Pick a vertical, enter your number, and the agent will call with a short scenario-driven conversation. After the call, your dashboard shows transcript, lead fields, and insights.
          </p>
          <div className="mt-8 grid gap-3 text-sm text-[#3f3448]">
            {["Dental receptionist in Kochi", "Property lead qualifier", "Restaurant reservation host"].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <CheckCircle2 className="size-4 text-[#57966f]" />
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[26px] border border-black/10 bg-white p-5 shadow-[0_30px_80px_rgba(25,13,35,0.14)] md:p-7">
          <PublicDemoCallForm />
        </div>
      </section>

      <section id="how" className="mx-auto max-w-7xl px-5 py-16">
        <div className="max-w-2xl">
          <div className="text-sm font-semibold text-[#8853a1]">How it works</div>
          <h2 className="mt-4 font-serif text-4xl font-semibold leading-tight md:text-5xl">A streaming call flow tuned so the reply starts early.</h2>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {howItWorks.map(([step, title, description]) => (
            <div key={step} className="rounded-2xl border border-black/10 bg-white p-6 shadow-[0_18px_44px_rgba(28,14,40,0.08)]">
              <div className="mb-10 flex items-center justify-between">
                <span className="font-mono text-sm text-[#8f4ead]">{step}</span>
                <Sparkles className="size-5 text-[#8f4ead]" />
              </div>
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#5d5364]">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl px-5 py-16">
        <div className="rounded-[28px] border border-black/10 bg-[#120a19] p-8 text-white shadow-[0_30px_90px_rgba(18,10,25,0.22)] md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="text-sm font-semibold text-[#e7b9ff]">Pricing</div>
              <h2 className="mt-4 max-w-2xl font-serif text-4xl font-semibold leading-tight md:text-5xl">Designed for lean, high-volume phone teams.</h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/72">
                Keep calls compact, retrieve only the right context, and move heavy analysis after hangup so live minutes stay efficient.
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/8 p-6">
              <Gauge className="mb-8 size-5 text-[#e7b9ff]" />
              <div className="text-4xl font-semibold">₹2-₹3</div>
              <div className="mt-2 text-sm text-white/70">target operating cost per minute</div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
