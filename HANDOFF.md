# Vaani AI Voice Handoff

## Current Status

- Next.js MVP is implemented with dashboard pages, API routes, Supabase persistence, LiveKit room/token plumbing, Gemini text/embedding helpers, document upload/parsing, hybrid pgvector RAG, call history, insights, leads, memory approval, export/delete, and Vobiz provider abstraction.
- Public landing page is implemented at `/` with three sample AI agents. A visitor can enter name, phone number, and use case, then trigger a Vaani demo call.
- Supabase migrations have been applied to the configured project.
- Demo auth user and `Sales Demo Agent` have been seeded with `npm run seed`.
- Local dev server is expected at `http://localhost:3000`.
- `VAANI_DEMO_MODE` is explicit. With real provider env, `/api/health` reports demo mode off.
- The repo is intended to be pushed to `https://github.com/tuttucodes/VaaniAI.git` for Netlify connection.
- Production Netlify URL: `https://vaanivoice.netlify.app/`.
- Latest pushed commit before the phone-listening patch: `c729321` (`Restyle marketing page and hide public stack details`).
- Current local worktree includes a phone-listening fix ready for commit and deployment.

## Active Context Rule

Read this file at the start of every future Vaani work session before editing or deploying. Treat it as the persistent project memory, then verify current git status because another agent or the user may have edited files.

## Immediate User Goal

The user wants the live product to actually work end to end:

1. Public homepage sample agents should call a real phone number.
2. The AI should hear caller speech, transcribe it, respond naturally, and store transcript/insights.
3. The assistant should run through the live platform like a human user, create/test an agent, and place a call.
4. The voice should feel semantic, human-like, and support Indian mixed speech/language switching as much as possible.

Current blocker stack:

- Vobiz call connects and speaks the first prompt.
- The first real production call to the user's test phone number queued successfully and connected:
  - call id: `efb9f6d0-a8b0-4636-a334-f070c0b742d1`
  - provider call id: `151bc781-10dd-4ee7-8ca3-3e055e7fb0fb`
- That call stored only the assistant greeting, no caller/user speech messages. So the phone provider did not send final speech to `/api/vobiz/demo-gather`, or the XML gather configuration was not good enough.
- Gemini also failed with quota/prepay exhaustion, so natural AI replies are blocked until Google AI Studio billing/prepay is fixed.

## Verification Completed

- `npm run typecheck` passed.
- `npm run build` passed.
- `npm audit --omit=dev` passed with 0 vulnerabilities.
- Gemini API key smoke check passed against `v1beta/models`.
- LiveKit token signing smoke check passed.
- `/api/health` returned Supabase/Gemini/LiveKit ready in local provider mode.
- Supabase seed produced one `Sales Demo Agent`.
- Dashboard QA created `Kochi Dental Receptionist`, started a dashboard outbound test call row, simulated a dental receptionist transcript, stored latency/cost metrics, generated fallback post-call insights, extracted a lead, and approved a suggested learning into memory.
- Production build now includes the new public demo routes:
  - `/api/public/demo-call`
  - `/api/vobiz/demo-answer`
  - `/api/vobiz/demo-gather`
  - `/api/vobiz/demo-ring`
  - `/api/vobiz/demo-hangup`
- Live Netlify homepage renders successfully with title `Vaani AI Voice` and no browser console warnings/errors.
- Live Netlify `/api/health` returned `ok:true`, `services_ready:true`, `real_calls_ready:true` after the user added env vars and redeployed.
- Live Netlify `/api/public/demo-call` returned HTTP 201 and queued the first dental call.
- Browser audit on 2026-06-27 captured `https://callvaani.tech/` and `https://vaanivoice.netlify.app/`. The public page has been restyled toward the CallVaani visual language and public UI copy has been scrubbed of provider-stack names.

## Public Marketing Direction

Reference captured from `https://callvaani.tech/`:

- Floating rounded top navigation with compact brand mark, simple section links, and a soft purple CTA.
- Editorial hero composition: large high-contrast serif headline, pastel blue/pink wash background, restrained body copy, and a latency proof card.
- Public positioning emphasizes human, India-native, code-switching phone agents. It does not reveal infrastructure provider names.
- First viewport includes a direct demo/sandbox CTA and visible live-latency proof.

Current Vaani implementation:

- Public home page uses a soft pastel background, floating pill nav, serif hero heading, latency proof card, code-switch examples, and an embedded sample-call form.
- Public UI avoids names of infrastructure providers and uses product terms such as voice route, phone calling, call journey, and knowledge retrieval.
- Keep technical provider details in README/HANDOFF/dashboard admin context only, not in public marketing copy.

## Provider Readiness

- Supabase: configured and migrated.
- Gemini: configured and reachable.
- LiveKit: configured; token creation works.
- Vobiz: public demo calls use the XML callback flow through `/Account/{VOBIZ_AUTH_ID}/Call/` with `X-Auth-ID` and `X-Auth-Token`. Dashboard LiveKit/SIP bridge fields still need final Vobiz SIP mapping for full real-time audio into LiveKit.
- Gemini generation and Gemini TTS are reachable with the newest local key. Do not commit or paste the raw key.
- If future smoke tests return HTTP 429 or `prepayment credits are depleted`, fix AI Studio billing/prepay for the project behind that key before debugging app code.
- Gemini runtime defaults are now in code:
  - text replies default to `gemini-2.5-flash-lite`
  - TTS defaults to `gemini-2.5-flash-preview-tts`
  - voice defaults to `Achird`
  - TTS auto-enables when `GEMINI_API_KEY` is configured unless `GEMINI_TTS_ENABLED=false`
- LiveKit: Cloud project credentials work for token creation. For real phone-call audio with sub-second latency, keep LiveKit Cloud and deploy the voice worker as an always-on service on DigitalOcean/Fly/Render. Netlify functions are not suitable for a persistent LiveKit media worker.
- Vobiz/LiveKit production setup still needs Vobiz SIP trunk username and password. Auth ID/token are only for REST/XML APIs; LiveKit SIP outbound trunk requires SIP domain, username, password, and caller ID number.
- For natural, interruptible calls, prefer Vobiz `<Stream bidirectional="true" keepCallAlive="true">` to an always-on WebSocket worker, or LiveKit SIP with a deployed LiveKit Agent. XML `<Gather>` is IVR-style and has already produced unreliable speech callbacks in live tests.

## Important Files

- App routes and dashboard: `app/`
- UI primitives: `components/ui/`
- Supabase clients: `lib/supabase/`
- Gemini helpers: `lib/ai/gemini.ts`
- RAG: `lib/rag/`
- Document parsing: `lib/documents/parser.ts`
- LiveKit server helpers: `lib/livekit/server.ts`
- Telephony abstraction: `lib/telephony/provider.ts`
- Vobiz adapter: `lib/telephony/vobiz.ts`
- Public demo scenarios: `lib/public-demo/`
- Public demo call form: `components/forms/public-demo-call-form.tsx`
- Public demo XML: `lib/public-demo/xml.ts`
- Public Vobiz callback routes:
  - `app/api/vobiz/demo-answer/route.ts`
  - `app/api/vobiz/demo-gather/route.ts`
  - `app/api/vobiz/demo-hangup/route.ts`
  - `app/api/vobiz/demo-ring/route.ts`
  - `app/api/vobiz/demo-noinput/route.ts` 
  - `app/api/vobiz/demo-interim/route.ts` 
  - `app/api/vobiz/demo-stream-status/route.ts`
- Voice worker MVP: `workers/voice-agent.ts`
- Vobiz Stream worker scaffold: `workers/vobiz-stream-agent.ts`
- Migrations: `supabase/migrations/`
- Seed script: `scripts/seed-demo.ts`
- Netlify config: `netlify.toml`

## Local Commands

```bash
npm install
npm run typecheck
npm run build
npm audit --omit=dev
npm run seed
npm run dev
```

For local commands that need real providers, load `.env.local` first:

```bash
set -a; source .env.local; set +a
```

## Netlify Deployment

Connect the GitHub repo in Netlify, set the build command to `npm run build`, and use the included `netlify.toml`. Add these environment variables in Netlify before the first production deploy.

Netlify UI path:

1. Open the Netlify site.
2. Go to `Site configuration`.
3. Open `Environment variables`.
4. Click `Add variable`.
5. Add each key below for the production context.
6. Save, then trigger a fresh production deploy.

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
VAANI_DEMO_MODE=false
GEMINI_API_KEY
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
VOBIZ_BASE_URL=https://api.vobiz.ai/api/v1
VOBIZ_AUTH_ID
VOBIZ_AUTH_SECRET
VOBIZ_WEBHOOK_SECRET
VOBIZ_PHONE_NUMBER
DEFAULT_FROM_NUMBER
NEXT_PUBLIC_APP_URL=https://<your-netlify-domain>
```

Set `NEXT_PUBLIC_APP_URL=https://vaanivoice.netlify.app` and redeploy. Vobiz callback URLs for the public demo depend on that value.

Required before the sample call can dial:

- Add all env vars above in Netlify Site settings.
- Redeploy the production site.
- Confirm `https://vaanivoice.netlify.app/api/health` returns `ok: true` and `real_calls_ready: true`.

Current Netlify env action needed:

- Update only `GEMINI_API_KEY` to the newest working key, save, then trigger a production deploy.
- Leave `GEMINI_CHAT_MODEL`, `GEMINI_TTS_ENABLED`, `GEMINI_TTS_MODEL`, and `GEMINI_TTS_VOICE` unset unless intentionally overriding the code defaults.

## Public Demo Call Flow

1. Visitor opens `/`.
2. Visitor picks Dental Reception, Real Estate Qualifier, or Restaurant Host.
3. Visitor enters name, E.164 phone number, and use case.
4. `/api/public/demo-call` validates input, creates a demo call row, and asks the telephony provider to call the phone number.
5. The provider calls back into `/api/vobiz/demo-answer`, `/api/vobiz/demo-gather`, and `/api/vobiz/demo-hangup`.
6. The app stores transcript turns, latency/cost estimates, and post-call insights.

The public demo currently uses provider XML `<Speak>/<Gather>` callbacks for reliability and fast deployment. Do not mention this implementation detail in public marketing UI. The dashboard product flow still provisions LiveKit rooms and is ready for the always-on worker once the worker is hosted.

## Phone Listening Fix

Vobiz Gather docs confirmed:

- `inputType="dtmf speech"` is valid.
- `speechModel="telephony"` is supported and optimized for phone audio.
- `language="en-IN"` is supported.
- `interimSpeechResultsCallback` is supported for real-time partial speech callbacks.
- Supported languages page lists English India (`en-IN`) but not full native Malayalam/Hindi/Tamil/Telugu/Kannada ASR codes for Gather. So XML Gather can improve Indian English and mixed English speech, but true all-Indian-language switching needs the LiveKit/Gemini streaming worker.

Patch implemented locally:

- `lib/public-demo/xml.ts`
  - default language changed from `en-US` to `en-IN`
  - Gather uses a conservative speech-only shape based on Vobiz docs: `inputType="speech"`, `speechModel="default"`, `speechEndTimeout="auto"`, `executionTimeout="30"`
  - accepts optional `fallbackUrl` and `interimUrl`
- `app/api/vobiz/demo-answer/route.ts`
  - generates the opening line with Gemini from the scenario prompt and landing-page use case
  - falls back to the scenario first prompt only if Gemini is unavailable
  - passes fallback URL `/api/vobiz/demo-noinput`
  - passes interim URL `/api/vobiz/demo-interim`
- `app/api/vobiz/demo-gather/route.ts`
  - accepts more speech field variants: `Speech`, `speech`, `StableSpeech`, `stable_speech`, `Digits`, `digits`
  - records DTMF fallback as user input
  - passes confidence into prompt
  - prompts Gemini to mirror Indian mixed speech naturally
- `app/api/public/demo-audio/route.ts`
  - generates a WAV response with Gemini TTS for stored assistant messages when `GEMINI_TTS_ENABLED=true`
  - intended to improve realism over provider `<Speak>`, but requires a working Gemini paid/prepay key
- Added `app/api/vobiz/demo-noinput/route.ts`
  - records no-input as a system message
  - retries once with a clearer prompt
  - then hangs up gracefully if still unheard
- Added `app/api/vobiz/demo-interim/route.ts`
  - records interim speech as system messages for diagnostics

Next steps:

1. Commit and push the phone-listening fix.
2. Wait for Netlify deploy.
3. Retest public homepage dental call.
4. If caller speech still does not appear, inspect interim/noinput system messages in Supabase for the new call.
5. Update Netlify `GEMINI_API_KEY` to the newest working key and redeploy before testing production Gemini/TTS behavior.

Latest test after commit `e44fccd`:

- A live dental demo call queued and connected.
- Vobiz call detail showed normal outbound completion with bill duration around 48 seconds.
- Supabase still stored only the assistant greeting, with no `user`, `Interim speech`, `No caller speech detected`, or hangup callback rows.
- The next patch simplified Gather XML to speech-only/default model to remove mixed DTMF mode as a variable.

Latest production test after commit `17193d0`:

- Public demo call queued and completed.
- Before the fast-answer fix, `call_messages` was empty and post-call analysis hallucinated from an empty transcript.
- Fix in progress: generate and store the opening line before dialing, pass `opening_message_id` into Vobiz, make answer webhook return XML without Gemini latency, and skip post-call analysis when no user transcript exists.

## Production Vobiz/LiveKit Checklist

- Vobiz REST/XML: `VOBIZ_AUTH_ID`, `VOBIZ_AUTH_SECRET`, `VOBIZ_BASE_URL`, `VOBIZ_PHONE_NUMBER`.
- Vobiz SIP trunk for LiveKit: SIP domain, SIP username, SIP password, caller ID number, trunk ID if available.
- LiveKit: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, outbound SIP trunk ID after provisioning.
- Vobiz inbound: route the Vobiz number/application/SIP trunk to LiveKit SIP URI or to Vobiz Stream XML answer URL.
- Vobiz Stream: deploy `npm run worker:vobiz-stream` on an always-on host with public TLS WebSocket URL, then set `PUBLIC_DEMO_USE_STREAM=true` and `VOBIZ_STREAM_WS_URL=wss://...`.
- Netlify remains the dashboard/API/callback host. It should not be used for the persistent WebSocket media worker.

## Notes For Next Engineer

- Do not commit `.env` or `.env.local`; both contain live provider secrets and are gitignored.
- Do not paste secrets into README, HANDOFF, issue bodies, or Netlify deploy logs.
- The current Gemini embedding model is `gemini-embedding-2` with 768-dimensional vectors, matching `agent_knowledge_chunks.embedding vector(768)`.
- `agent_knowledge_chunks.content_tsv` is maintained by trigger because Postgres rejected the original generated-column expression as not immutable.
- `public.users` references `auth.users`, so seed data must create or reuse a real Supabase Auth user before inserting profile/agent rows.
- Vobiz is intentionally abstracted behind `TelephonyProvider`. XML callback calls are implemented; full SIP/LiveKit bridge mapping is the remaining provider-specific item.
- The LiveKit worker is a TypeScript MVP orchestrator with clear interfaces and TODO boundaries for actual audio-frame STT/TTS provider streaming behavior. Host it as an always-on worker, not a serverless function.
- Client forms use explicit `onSubmit` handlers for agent creation, knowledge upload, and outbound calls. This avoids fragile client `form action` behavior in the dashboard.
- `scripts/simulate-dental-call.ts` can be run against a call id to seed a realistic dental receptionist transcript and post-call analysis for QA.
## 2026-06-28 Stream Worker + Agent Builder Update

- New Google CLI account authenticated as `raybkmedia@gmail.com`.
- Active deploy project selected: `project-519d9218-f822-42ae-823` (`My First Project`), billing enabled.
- Cloud APIs enabled: Cloud Run, Cloud Build, Artifact Registry.
- Vobiz Stream worker is deployed on Cloud Run:
  - HTTPS health URL: `https://vaani-vobiz-stream-881777363529.asia-south1.run.app/health`
  - WebSocket URL for Netlify: `wss://vaani-vobiz-stream-881777363529.asia-south1.run.app`
  - Health check returned `{ ok: true, worker: "vobiz-stream-agent", mode: "gemini-live" }`.
- Netlify production env updates made:
  - `PUBLIC_DEMO_USE_STREAM=true`
  - `VOBIZ_STREAM_WS_URL=wss://vaani-vobiz-stream-881777363529.asia-south1.run.app`
  - removed production `GEMINI_CHAT_MODEL` override; attempted to remove `GEMINI_EMBEDDING_MODEL` override so code defaults control these.
- `workers/vobiz-stream-agent.ts` now uses Gemini Live via `@google/genai`:
  - receives Vobiz bidirectional Stream audio
  - converts inbound Vobiz L16 big-endian to little-endian
  - resamples phone audio to Gemini Live 16 kHz input
  - streams Gemini audio output back to Vobiz as L16 little-endian
  - stores Gemini input/output transcripts as call messages
  - sends `clearAudio` on barge-in energy while assistant audio is queued
- Public demo Stream XML now negotiates `audio/x-l16;rate=16000` by default.
- Added Cloud Build file `cloudbuild.vobiz-stream.yaml` and `Dockerfile.vobiz-stream`.
- Added `/api/agents/improve` plus dashboard "Improve with AI" button for agent creation/editing. It uses Gemini server-side to improve description, prompt, first message, and end-call rules without exposing keys.

## 2026-06-28 Gemini Live Fallback Decision

- Live API smoke tests showed the current Gemini API key/project exposes text, audio-understanding, embedding, and TTS models, but no `bidiGenerateContent`/Live models in `v1beta` or `v1alpha`.
- The worker was changed from Gemini Live to a custom orchestration layer:
  - Vobiz WebSocket receives 20 ms L16 frames.
  - Worker converts Vobiz inbound big-endian L16 to little-endian PCM.
  - Worker does simple RMS VAD/endpointing.
  - Each caller utterance is transcribed by Gemini audio-understanding (`GEMINI_STT_MODEL` or `gemini-2.5-flash`).
  - Gemini text model creates the short receptionist reply.
  - Gemini TTS creates 8 kHz PCM and streams it back to Vobiz via `playAudio`.
  - Transcript and latency system notes are stored in Supabase.
- This is not as low-latency as Gemini Live, but it uses only models currently available to the active Gemini key and should make the demo actually converse.
- Dograh reference repo was shallow-cloned outside the app repo at `/tmp/vaani-reference-repos/dograh` for architecture reference.

## 2026-06-28 8 kHz Stream Fix + Latest Test

- Vobiz audio-stream docs confirmed the negotiated stream format must exactly match `playAudio`.
- Previous production test negotiated `audio/x-l16;rate=16000`, while the Gemini TTS helper emits 8 kHz PCM. That mismatch likely caused robotic/broken playback.
- Patch pushed to GitHub on `main` as `abf732d`:
  - `lib/public-demo/xml.ts` now negotiates `audio/x-l16;rate=8000` for public demo streams.
  - `workers/vobiz-stream-agent.ts` has more sensitive RMS VAD thresholds and logs stream diagnostics: frame count, speech-like frame count, max RMS, and processed turns.
- Cloud Run worker deployed as revision `vaani-vobiz-stream-00004-kgx`, serving 100 percent of traffic.
- Worker health check returns `{ ok: true, worker: "vobiz-stream-agent", mode: "gemini-orchestrated" }`.
- Netlify deploy for commit `abf732d` completed successfully.
- Latest live dental demo call:
  - App call id: `45726b9d-c82b-41be-8a37-d03e8d132048`
  - Vobiz call id: `822e5965-98c9-4543-b4fb-33116bcde364`
  - CDR result: `answer_time=null`, `billsec=0`, `ring_time=52`, `hangup_cause=NO_USER_RESPONSE`, `hangup_source=Carrier`, `total_cost=0`.
  - Interpretation: this attempt was not answered/reached media, so there was no caller speech to transcribe.
- Next valid voice test requires the callee to answer the call and speak after the greeting. Then inspect `call_messages` for:
  - `Vobiz stream started: ... at 8000 Hz`
  - user transcript row
  - assistant response row
  - final diagnostics row: `Vobiz stream closed. Frames=..., speech_like=..., max_rms=..., processed_turns=...`

## 2026-06-28 Dashboard Agent Creation + Stream Calls

- Production dashboard was tested with a disposable confirmed Supabase user.
- Created a real dashboard agent:
  - Agent id: `b96ab007-5abb-4f2b-a3df-634b20d150a9`
  - Name: `Kochi Dental Receptionist`
- The `/api/agents/improve` endpoint initially failed in the live UI with `AI response did not include JSON`.
- Patch pushed as `010f925`:
  - Gemini text helper supports `responseMimeType: "application/json"`.
  - `/api/agents/improve` requests JSON mode and falls back to a deterministic production-safe improvement if Gemini still returns malformed text.
  - Live retest succeeded with no UI error.
- Dashboard agent creation succeeded after using temperature `0.4`; the earlier `0.45` test value was blocked by the browser because the input step is `0.1`.
- Patch pushed as `7a975f6`:
  - Added `/api/vobiz/agent-answer` for dashboard outbound calls.
  - `startCall` now stores the agent first message and, when `VOBIZ_STREAM_WS_URL` is configured, places outbound calls through Vobiz XML/Stream instead of the old generic TODO adapter.
  - The Cloud Run stream worker now loads `agents.system_prompt` and `agents.first_message` from Supabase for each call.
  - Cloud Run worker deployed as revision `vaani-vobiz-stream-00005-98s`.
- Dashboard Start Call live test:
  - App call id: `c9e76aa8-c0e8-4055-be95-b9e938828f38`
  - Vobiz call id: `adb4e0d9-e02c-4325-ab9a-5feee283b097`
  - CDR: `answer_time=null`, `billsec=0`, `ring_time=53`, `hangup_cause=NO_USER_RESPONSE`, `hangup_source=Carrier`, `total_cost=0`.
  - Interpretation: dashboard call creation and Vobiz dial-out worked, but this test call was not answered, so no Vobiz stream opened and no caller transcript could be captured.

## 2026-06-28 Answered Call Audio Diagnosis

- User requested `call now`; production public dental demo call was placed.
- App call id: `c1ef68af-c712-4be2-8b3d-fd6453a8a77b`
- Vobiz call id: `004e9ed3-9cb5-411e-85d7-9a9e1cdff78e`
- This call was answered:
  - `answer_time=2026-06-28T05:07:50Z`
  - `billsec=32`
  - `hangup_cause=NORMAL_CLEARING`
  - `hangup_source=Callee`
  - `codec=PCMU`
  - `mos=4.5`
  - `streaming_cost=0.2`, `total_cost=0.65`
- Supabase messages showed:
  - stream opened at 8000 Hz
  - strong inbound audio activity (`Frames=1527`, `speech_like=1526`, `max_rms=0.6928`, `processed_turns=2`)
  - Gemini STT returned no transcript twice
- Local STT smoke test with Gemini TTS-generated 8 kHz audio succeeded, so Gemini STT itself is working.
- Diagnosis: Vobiz/carrier leg used PCMU, but the worker treated inbound stream media as L16 PCM. That likely sent decoded noise to Gemini STT.
- Patch pushed as `4a37316`:
  - Worker now supports µ-law/PCMU inbound decode and outbound encode.
  - Worker logs negotiated media encoding in the stream-start message.
  - Worker auto-detects µ-law frames when 8 kHz 20 ms payloads are 160 bytes.
- Cloud Run worker deployed as revision `vaani-vobiz-stream-00006-xcd`, health check OK.
- Next test should be a fresh answered call after revision `00006-xcd`. If STT still fails, collect from Vobiz console:
  - Call Logs detail page for the Vobiz call id
  - XML/Application request logs for answer URL and stream status callbacks
  - Any stream start/media format fields Vobiz exposes (`encoding`, `sampleRate`, `contentType`)
  - Whether Vobiz force-transcodes streams to PCMU despite requested `audio/x-l16;rate=8000`
