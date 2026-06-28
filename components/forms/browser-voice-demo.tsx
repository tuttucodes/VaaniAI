"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, PhoneOff, Sparkles, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ScenarioId = "cart-recovery" | "appointment-booking" | "payment-followups";

type Turn = {
  role: "user" | "assistant";
  content: string;
};

type DemoScenario = {
  id: ScenarioId;
  title: string;
  company: string;
  summary: string;
  context: string;
  accentClass: string;
  glowClass: string;
};

type BrowserSessionResponse = {
  call_id: string;
  stream_id: string;
  ws_url: string;
  error?: string;
};

const scenarios: DemoScenario[] = [
  {
    id: "cart-recovery",
    title: "Cart Recovery",
    company: "Vaani Stores",
    summary: "Recover abandoned carts without sounding pushy.",
    context:
      "You are calling for Vaani Stores. The customer left items in their cart. Help them complete checkout, answer simple questions, and offer a callback or WhatsApp link if needed. Be warm, brief, and never pushy."
    ,
    accentClass: "from-[#f26db8] via-[#d6d6ff] to-[#8fa2ff]",
    glowClass: "shadow-[0_28px_80px_rgba(209,102,183,0.28)]"
  },
  {
    id: "appointment-booking",
    title: "Appointment Booking",
    company: "Vaani Hospitals",
    summary: "Book clinic appointments and collect symptoms.",
    context:
      "You are Maya, a receptionist for Vaani Hospitals in Kochi. Help the caller book a dental appointment only if they want it. Ask one question at a time about pain, swelling, fever, preferred time, name, and callback number. Mirror English, Malayalam, or Manglish naturally."
    ,
    accentClass: "from-[#ff6b00] via-[#ff9d2e] to-[#ffd18b]",
    glowClass: "shadow-[0_28px_80px_rgba(255,122,26,0.28)]"
  },
  {
    id: "payment-followups",
    title: "Payment Follow-ups",
    company: "Vaani Finance",
    summary: "Follow up respectfully and resolve payment blockers.",
    context:
      "You are calling from Vaani Finance about a pending payment. Be respectful and calm. Understand if the customer needs help, offer a payment link or callback, and never pressure, threaten, or shame them."
    ,
    accentClass: "from-[#78c742] via-[#d7e7af] to-[#f1d6d6]",
    glowClass: "shadow-[0_28px_80px_rgba(112,172,65,0.25)]"
  }
];

function formatTimer(seconds: number) {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}

function statusLabel(status: string) {
  if (status === "off") return "Ready";
  if (status === "starting") return "Connecting";
  if (status === "listening") return "Listening";
  if (status === "speaking") return "Speaking";
  return status;
}

function friendlyError(message?: string) {
  if (!message) return "Voice is not ready yet. Try again in a few seconds.";
  if (/microphone|permission|allowed|denied|notallowed|notfound/i.test(message)) {
    return "Microphone permission is blocked. Click Start again and allow microphone access.";
  }
  if (/quota|429|limit|precondition|permission|denied|billing/i.test(message)) {
    return "Voice output hit an account or billing limit. Check the Google Cloud project and try again.";
  }
  if (/configured|websocket|network|connect/i.test(message)) return "Live voice streaming is not connected yet. Check the worker URL and try again.";
  return "Voice is not ready yet. Try again in a few seconds.";
}

function pcm16SampleToFloat(sample: number) {
  return Math.max(-1, Math.min(1, sample / 32768));
}

function ulawByteToPcm16(value: number) {
  const ulaw = ~value & 0xff;
  const sign = ulaw & 0x80;
  const exponent = (ulaw >> 4) & 0x07;
  const mantissa = ulaw & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  return sign ? -sample : sample;
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function encodePcm16Le(samples: Float32Array, inputRate: number, outputRate = 8000) {
  const ratio = inputRate / outputRate;
  const outputLength = Math.max(1, Math.floor(samples.length / ratio));
  const output = new Uint8Array(outputLength * 2);

  for (let index = 0; index < outputLength; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[Math.floor(index * ratio)] || 0));
    const value = sample < 0 ? sample * 32768 : sample * 32767;
    const intValue = Math.round(value);
    output[index * 2] = intValue & 0xff;
    output[index * 2 + 1] = (intValue >> 8) & 0xff;
  }

  return output;
}

function decodeAssistantAudio(payload: string, contentType: string) {
  const bytes = base64ToBytes(payload);
  if (contentType.toLowerCase().includes("mulaw") || contentType.toLowerCase().includes("pcmu")) {
    const floats = new Float32Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) floats[index] = pcm16SampleToFloat(ulawByteToPcm16(bytes[index]));
    return floats;
  }

  const samples = Math.floor(bytes.length / 2);
  const floats = new Float32Array(samples);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < samples; index += 1) floats[index] = pcm16SampleToFloat(view.getInt16(index * 2, true));
  return floats;
}

export function BrowserVoiceDemo() {
  const [activeScenarioId, setActiveScenarioId] = useState<ScenarioId>("appointment-booking");
  const activeScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === activeScenarioId) || scenarios[1],
    [activeScenarioId]
  );
  const [context, setContext] = useState(activeScenario.context);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<"off" | "starting" | "listening" | "speaking">("off");
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [latency, setLatency] = useState<number | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const zeroGainRef = useRef<GainNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextPlayTimeRef = useRef(0);
  const meterTimerRef = useRef<number | null>(null);
  const clockTimerRef = useRef<number | null>(null);
  const turnsRef = useRef<Turn[]>([]);
  const contextRef = useRef(context);
  const statusRef = useRef(status);

  const isOn = status !== "off";

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (!isOn) setContext(activeScenario.context);
  }, [activeScenario, isOn]);

  useEffect(() => {
    return () => stopSession();
  }, []);

  function appendTurn(turn: Turn) {
    const last = turnsRef.current[turnsRef.current.length - 1];
    if (last?.role === turn.role && last.content === turn.content) return;
    const trimmed = [...turnsRef.current, turn].slice(-12);
    turnsRef.current = trimmed;
    setTurns(trimmed);
  }

  function startClock() {
    if (clockTimerRef.current) window.clearInterval(clockTimerRef.current);
    setElapsed(0);
    clockTimerRef.current = window.setInterval(() => setElapsed((value) => value + 1), 1000);
  }

  async function createBrowserSession(scenario: DemoScenario) {
    const response = await fetch("/api/public/browser-voice-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenario_id: scenario.id,
        context: contextRef.current
      })
    });
    const payload = (await response.json()) as BrowserSessionResponse;
    if (!response.ok || !payload.ws_url) throw new Error(payload.error || "Browser voice session failed.");
    return payload;
  }

  async function startSession(scenarioId = activeScenarioId) {
    const scenario = scenarios.find((item) => item.id === scenarioId) || scenarios[1];
    const sessionContext = scenario.id === activeScenarioId ? contextRef.current : scenario.context;
    setActiveScenarioId(scenario.id);
    setContext(sessionContext);
    contextRef.current = sessionContext;
    setTurns([]);
    turnsRef.current = [];
    setError("");
    setLatency(null);
    setStatus("starting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      });
      streamRef.current = stream;
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error("This browser does not support live audio.");
      const audioContext = new AudioContextClass({ latencyHint: "interactive" });
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") await audioContext.resume();
      const session = await createBrowserSession(scenario);

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      const processor = audioContext.createScriptProcessor(1024, 1, 1);
      const zeroGain = audioContext.createGain();
      zeroGain.gain.value = 0;
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.45;
      source.connect(analyser);
      source.connect(processor);
      processor.connect(zeroGain);
      zeroGain.connect(audioContext.destination);

      const ws = new WebSocket(session.ws_url);
      wsRef.current = ws;
      analyserRef.current = analyser;
      processorRef.current = processor;
      zeroGainRef.current = zeroGain;
      nextPlayTimeRef.current = audioContext.currentTime + 0.05;

      processor.onaudioprocess = (event) => {
        if (ws.readyState !== WebSocket.OPEN || statusRef.current === "off") return;
        const pcm = encodePcm16Le(event.inputBuffer.getChannelData(0), audioContext.sampleRate, 8000);
        ws.send(JSON.stringify({ event: "media", media: { payload: bytesToBase64(pcm) } }));
      };

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            event: "start",
            start: {
              callId: session.call_id,
              streamId: session.stream_id,
              mediaFormat: { encoding: "audio/x-l16le", sampleRate: 8000 }
            }
          })
        );
        startClock();
        startMeterLoop();
        setStatus("listening");
      };

      ws.onmessage = (event) => handleWorkerMessage(event.data);
      ws.onerror = () => setError(friendlyError("websocket connection failed"));
      ws.onclose = () => {
        if (statusRef.current !== "off") setStatus("off");
      };
    } catch (sessionError) {
      setError(friendlyError(sessionError instanceof Error ? sessionError.message : undefined));
      stopSession();
    }
  }

  function stopSession() {
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;
    stopAssistantAudio();
    try {
      processorRef.current?.disconnect();
      zeroGainRef.current?.disconnect();
    } catch {}
    processorRef.current = null;
    zeroGainRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (meterTimerRef.current) window.clearInterval(meterTimerRef.current);
    if (clockTimerRef.current) window.clearInterval(clockTimerRef.current);
    meterTimerRef.current = null;
    clockTimerRef.current = null;
    analyserRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    sourcesRef.current = [];
    nextPlayTimeRef.current = 0;
    setLevel(0);
    setStatus("off");
  }

  function stopAssistantAudio() {
    for (const source of sourcesRef.current) {
      try {
        source.stop();
      } catch {}
    }
    sourcesRef.current = [];
    const audioContext = audioContextRef.current;
    if (audioContext) nextPlayTimeRef.current = audioContext.currentTime + 0.03;
  }

  function startMeterLoop() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.fftSize);
    if (meterTimerRef.current) window.clearInterval(meterTimerRef.current);
    meterTimerRef.current = window.setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let index = 0; index < data.length; index += 1) {
        const sample = (data[index] - 128) / 128;
        sum += sample * sample;
      }
      setLevel(Math.min(1, Math.sqrt(sum / data.length) / 0.12));
    }, 50);
  }

  function handleWorkerMessage(raw: string | ArrayBufferLike | Blob | ArrayBufferView) {
    if (typeof raw !== "string") return;
    let message: {
      event?: string;
      role?: "user" | "assistant";
      content?: string;
      latency_ms?: number;
      metric?: string;
      media?: { payload?: string; contentType?: string; sampleRate?: number };
    };
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.event === "transcript" && message.role && message.content) {
      appendTurn({ role: message.role, content: message.content });
      if (message.role === "assistant") setStatus("speaking");
      if (message.role === "user" && statusRef.current !== "off") setStatus("listening");
      return;
    }

    if (message.event === "latency" && typeof message.latency_ms === "number") {
      setLatency(message.latency_ms);
      return;
    }

    if (message.event === "clearAudio") {
      stopAssistantAudio();
      return;
    }

    if (message.event === "playAudio" && message.media?.payload) {
      playAudioFrame(message.media.payload, message.media.contentType || "audio/x-mulaw", message.media.sampleRate || 8000);
    }
  }

  function playAudioFrame(payload: string, contentType: string, sampleRate: number) {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;
    const samples = decodeAssistantAudio(payload, contentType);
    const buffer = audioContext.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.onended = () => {
      sourcesRef.current = sourcesRef.current.filter((item) => item !== source);
      if (!sourcesRef.current.length && statusRef.current === "speaking") setStatus("listening");
    };
    const startAt = Math.max(audioContext.currentTime + 0.01, nextPlayTimeRef.current || audioContext.currentTime + 0.01);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;
    sourcesRef.current.push(source);
    setStatus("speaking");
  }

  return (
    <div className="rounded-[28px] border border-black/10 bg-white shadow-[0_24px_80px_rgba(64,75,140,0.12)]">
      <div className="grid grid-cols-2 gap-1 border-b border-black/5 p-3 text-sm font-medium text-[#696975] md:grid-cols-5">
        {["Text to Speech", "Speech to Text", "Voice Agents", "Documents", "Dubbing"].map((item) => (
          <div
            key={item}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-full px-3 text-center",
              item === "Voice Agents" ? "border border-[#d9e3ff] bg-[#f2f6ff] text-[#21339a] shadow-sm" : ""
            )}
          >
            {item}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 border-b border-black/5 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#22222a]">Experience Vaani</h2>
          <p className="mt-1 text-sm text-[#6d6d78]">Pick a sample agent, allow the mic, and talk naturally.</p>
        </div>
        <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#30303a]">
          <span className={cn("size-2 rounded-full", isOn ? "bg-[#18c964]" : "bg-[#b9bac4]")} />
          {statusLabel(status)}
          {latency !== null ? <span className="normal-case tracking-normal text-[#6d6d78]">{latency} ms</span> : null}
        </div>
      </div>

      <div className="grid gap-7 px-6 py-8 lg:grid-cols-3">
        {scenarios.map((scenario) => {
          const active = activeScenarioId === scenario.id;
          const running = isOn && active;
          return (
            <div key={scenario.id} className="flex flex-col items-center gap-5">
              <button
                type="button"
                onClick={() => {
                  if (running) stopSession();
                  else void startSession(scenario.id);
                }}
                className={cn(
                  "relative flex aspect-square w-full max-w-[260px] items-center justify-center rounded-[36%] bg-gradient-to-br p-8 text-[#25242c] transition duration-200",
                  scenario.accentClass,
                  scenario.glowClass,
                  active ? "scale-[1.02]" : "opacity-90 hover:scale-[1.01] hover:opacity-100"
                )}
                style={{
                  clipPath:
                    "polygon(50% 0%,61% 14%,78% 10%,85% 26%,100% 35%,92% 52%,100% 68%,84% 76%,78% 94%,60% 89%,50% 100%,40% 89%,22% 94%,16% 76%,0% 68%,8% 52%,0% 35%,15% 26%,22% 10%,39% 14%)"
                }}
                aria-label={`${running ? "Stop" : "Start"} ${scenario.title}`}
              >
                <span className="flex min-h-14 min-w-36 items-center justify-center rounded-full bg-white/78 px-6 text-base font-semibold shadow-sm backdrop-blur">
                  {running ? (
                    <span className="inline-flex items-center gap-3">
                      {formatTimer(elapsed)}
                      <PhoneOff className="size-5 text-[#d9232e]" />
                    </span>
                  ) : (
                    "Start speaking"
                  )}
                </span>
              </button>
              <div className="text-center">
                <div className="text-xl font-semibold text-[#282832]">{scenario.title}</div>
                <div className="mt-1 text-sm font-medium text-[#62616d]">{scenario.company}</div>
                <p className="mx-auto mt-2 max-w-[240px] text-sm leading-6 text-[#767582]">{scenario.summary}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 border-t border-black/5 p-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-black/10 bg-[#fbfbfd] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#2d2d35]">
            <Sparkles className="size-4 text-[#21339a]" />
            Agent context
          </div>
          <Textarea
            className="mt-3 min-h-28 resize-none border-black/10 bg-white"
            value={context}
            onChange={(event) => setContext(event.target.value)}
            disabled={isOn}
          />
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10">
            <div className="h-full rounded-full bg-[#21339a] transition-[width] duration-75" style={{ width: `${Math.max(3, level * 100)}%` }} />
          </div>
          {error ? <p className="mt-3 text-sm font-medium text-[#b42318]">{error}</p> : null}
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-[#2d2d35]">Conversation</div>
            {isOn ? (
              <Button type="button" variant="outline" size="sm" onClick={stopSession}>
                <PhoneOff className="size-4" />
                End
              </Button>
            ) : null}
          </div>
          <div className="flex max-h-64 flex-col gap-3 overflow-auto pr-1">
            {turns.length ? (
              turns.map((turn, index) => (
                <div
                  key={`${turn.role}-${index}`}
                  className={cn(
                    "rounded-2xl border p-3 text-sm leading-6",
                    turn.role === "assistant" ? "border-[#dfe5ff] bg-[#f5f7ff]" : "border-black/10 bg-[#fbfbfd]"
                  )}
                >
                  <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#777684]">
                    {turn.role === "assistant" ? <Volume2 className="size-3" /> : <Mic className="size-3" />}
                    {turn.role === "assistant" ? activeScenario.company : "You"}
                  </div>
                  {turn.content}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-black/15 bg-[#fbfbfd] p-5 text-sm leading-6 text-[#676774]">
                Start one of the sample agents. It will speak first, then you can reply in English, Malayalam, Manglish, Hindi, Tamil, Telugu, or Kannada.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
