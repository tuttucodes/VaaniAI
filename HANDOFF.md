# Vaani AI Voice Handoff

## Current Status

- Next.js MVP is implemented with dashboard pages, API routes, Supabase persistence, LiveKit room/token plumbing, Gemini text/embedding helpers, document upload/parsing, hybrid pgvector RAG, call history, insights, leads, memory approval, export/delete, and Vobiz provider abstraction.
- Public landing page is implemented at `/` with three sample AI agents. A visitor can enter name, phone number, and use case, then trigger a Vobiz XML callback demo call.
- Supabase migrations have been applied to the configured project.
- Demo auth user and `Sales Demo Agent` have been seeded with `npm run seed`.
- Local dev server is expected at `http://localhost:3000`.
- `VAANI_DEMO_MODE` is explicit. With real provider env, `/api/health` reports demo mode off.
- The repo is intended to be pushed to `https://github.com/tuttucodes/VaaniAI.git` for Netlify connection.
- Production Netlify URL: `https://vaanivoice.netlify.app/`.

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
- Live Netlify `/api/health` currently returns HTTP 503 because Supabase, LiveKit, and Vobiz env vars are not set in Netlify yet.
- Live Netlify `/api/public/demo-call` currently returns `Supabase is required for public demo calls.` No real call is placed until Netlify env is configured.

## Provider Readiness

- Supabase: configured and migrated.
- Gemini: configured and reachable.
- LiveKit: configured; token creation works.
- Vobiz: public demo calls use the XML callback flow through `/Account/{VOBIZ_AUTH_ID}/Call/` with `X-Auth-ID` and `X-Auth-Token`. Dashboard LiveKit/SIP bridge fields still need final Vobiz SIP mapping for full real-time audio into LiveKit.
- Gemini generation is reachable but returned quota exhaustion during dental post-call QA. The app falls back to conservative transcript extraction so call records still get usable summaries/leads while provider quota is restored.
- LiveKit: Cloud project credentials work for token creation. For real phone-call audio with sub-second latency, keep LiveKit Cloud and deploy the voice worker as an always-on service on DigitalOcean/Fly/Render. Netlify functions are not suitable for a persistent LiveKit media worker.

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
- Voice worker MVP: `workers/voice-agent.ts`
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

Connect the GitHub repo in Netlify, set the build command to `npm run build`, and use the included `netlify.toml`. Add these environment variables in Netlify before the first production deploy:

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
VAANI_DEMO_MODE=false
GEMINI_API_KEY
GEMINI_CHAT_MODEL=gemini-2.0-flash
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
- Confirm `https://vaanivoice.netlify.app/api/health` returns `ok: true` with Supabase, Gemini, LiveKit, and Vobiz ready.

## Public Demo Call Flow

1. Visitor opens `/`.
2. Visitor picks Dental Reception, Real Estate Qualifier, or Restaurant Host.
3. Visitor enters name, E.164 phone number, and use case.
4. `/api/public/demo-call` validates input, creates a demo call row, and asks Vobiz to call the phone number.
5. Vobiz calls back into `/api/vobiz/demo-answer`, `/api/vobiz/demo-gather`, and `/api/vobiz/demo-hangup`.
6. The app stores transcript turns, latency/cost estimates, and post-call insights.

The public demo currently uses Vobiz XML `<Speak>/<Gather>` callbacks for reliability and fast deployment. The dashboard product flow still provisions LiveKit rooms and is ready for the always-on worker once the worker is hosted.

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
