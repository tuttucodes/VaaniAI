create extension if not exists "pgcrypto";
create extension if not exists "vector";
create extension if not exists "pg_trgm";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  description text,
  system_prompt text not null,
  first_message text,
  language text not null default 'en-IN',
  voice_id text not null default 'gemini-natural-female',
  model_config jsonb not null default '{}'::jsonb,
  latency_config jsonb not null default '{}'::jsonb,
  cost_config jsonb not null default '{}'::jsonb,
  vobiz_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agents_user_name_unique unique (user_id, name)
);

create table if not exists public.agent_knowledge_files (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  filename text not null,
  file_type text not null,
  storage_path text not null,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'ready', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.agent_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  file_id uuid not null references public.agent_knowledge_files(id) on delete cascade,
  content text not null,
  summary text,
  keywords text[] not null default '{}',
  embedding vector(768),
  token_count integer not null default 0,
  source_reference text,
  content_tsv tsvector,
  created_at timestamptz not null default now()
);

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  phone_number text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  status text not null default 'queued' check (status in ('queued', 'ringing', 'in_progress', 'completed', 'failed', 'canceled')),
  livekit_room_name text,
  vobiz_call_id text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  recording_url text,
  total_cost_estimate numeric(12, 4),
  summary text
);

create table if not exists public.call_messages (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant', 'tool')),
  content text not null,
  timestamp timestamptz not null default now(),
  latency_ms integer
);

create table if not exists public.call_metrics (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  speech_end_to_transcript_ms integer,
  transcript_to_first_token_ms integer,
  first_token_to_first_audio_ms integer,
  rag_retrieval_ms integer,
  total_response_latency_ms integer,
  interruption_count integer not null default 0,
  average_response_latency_ms integer,
  estimated_cost numeric(12, 4),
  created_at timestamptz not null default now()
);

create table if not exists public.call_insights (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  intent text,
  sentiment text,
  outcome text,
  objections jsonb not null default '[]'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '[]'::jsonb,
  follow_up_required boolean not null default false,
  extracted_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.extracted_leads (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  name text,
  phone text,
  email text,
  company text,
  requirement text,
  budget text,
  timeline text,
  status text not null default 'new',
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  source_call_id uuid references public.calls(id) on delete set null,
  content text not null,
  category text,
  confidence_score numeric(4, 3),
  approved_by_user boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_learning_events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  source_call_id uuid references public.calls(id) on delete set null,
  suggested_learning text not null,
  reason text,
  confidence_score numeric(4, 3),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.unanswered_questions (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  question text not null,
  attempted_answer text,
  reason_failed text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.call_references (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  knowledge_chunk_id uuid not null references public.agent_knowledge_chunks(id) on delete cascade,
  message_id uuid references public.call_messages(id) on delete set null,
  relevance_score numeric(6, 5),
  created_at timestamptz not null default now()
);

create index if not exists users_email_idx on public.users (email);
create index if not exists agents_user_id_idx on public.agents (user_id, created_at desc);
create index if not exists agent_knowledge_files_user_id_idx on public.agent_knowledge_files (user_id, created_at desc);
create index if not exists agent_knowledge_files_agent_id_idx on public.agent_knowledge_files (agent_id, created_at desc);
create index if not exists agent_knowledge_chunks_agent_id_idx on public.agent_knowledge_chunks (agent_id);
create index if not exists agent_knowledge_chunks_file_id_idx on public.agent_knowledge_chunks (file_id);
create index if not exists agent_knowledge_chunks_content_tsv_idx on public.agent_knowledge_chunks using gin (content_tsv);
create index if not exists agent_knowledge_chunks_embedding_hnsw_idx on public.agent_knowledge_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists calls_user_id_started_at_idx on public.calls (user_id, started_at desc);
create index if not exists calls_agent_id_started_at_idx on public.calls (agent_id, started_at desc);
create index if not exists calls_vobiz_call_id_idx on public.calls (vobiz_call_id);
create index if not exists call_messages_call_id_timestamp_idx on public.call_messages (call_id, timestamp);
create index if not exists call_metrics_call_id_created_at_idx on public.call_metrics (call_id, created_at desc);
create index if not exists call_insights_call_id_idx on public.call_insights (call_id);
create index if not exists extracted_leads_agent_id_created_at_idx on public.extracted_leads (agent_id, created_at desc);
create index if not exists extracted_leads_phone_idx on public.extracted_leads (phone);
create index if not exists extracted_leads_email_idx on public.extracted_leads (email);
create index if not exists agent_memory_agent_id_created_at_idx on public.agent_memory (agent_id, created_at desc);
create index if not exists agent_learning_events_agent_status_idx on public.agent_learning_events (agent_id, status, created_at desc);
create index if not exists unanswered_questions_agent_status_idx on public.unanswered_questions (agent_id, status, created_at desc);
create index if not exists call_references_call_id_idx on public.call_references (call_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create or replace function public.set_knowledge_content_tsv()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.content_tsv := to_tsvector('simple', coalesce(new.content, '') || ' ' || array_to_string(new.keywords, ' '));
  return new;
end;
$$;

drop trigger if exists set_agent_knowledge_chunks_content_tsv on public.agent_knowledge_chunks;
create trigger set_agent_knowledge_chunks_content_tsv
before insert or update of content, keywords on public.agent_knowledge_chunks
for each row execute function public.set_knowledge_content_tsv();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.owns_agent(agent_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.agents
    where id = agent_uuid
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.owns_call(call_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.calls
    where id = call_uuid
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.match_agent_knowledge(
  p_agent_id uuid,
  p_query_embedding vector(768),
  p_query_text text,
  p_match_count integer default 5
)
returns table (
  id uuid,
  agent_id uuid,
  file_id uuid,
  content text,
  summary text,
  keywords text[],
  token_count integer,
  source_reference text,
  similarity double precision,
  keyword_score double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select
      c.id,
      c.agent_id,
      c.file_id,
      c.content,
      c.summary,
      c.keywords,
      c.token_count,
      c.source_reference,
      1 - (c.embedding <=> p_query_embedding) as similarity,
      ts_rank_cd(c.content_tsv, plainto_tsquery('simple', p_query_text)) as keyword_score
    from public.agent_knowledge_chunks c
    where c.agent_id = p_agent_id
      and c.embedding is not null
      and (
        current_setting('request.jwt.claim.role', true) = 'service_role'
        or public.owns_agent(p_agent_id)
      )
    order by c.embedding <=> p_query_embedding
    limit 30
  )
  select *
  from candidates
  order by (similarity * 0.72 + coalesce(keyword_score, 0) * 0.28) desc
  limit least(greatest(p_match_count, 1), 8);
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.set_knowledge_content_tsv() from public;
revoke all on function public.owns_agent(uuid) from public;
revoke all on function public.owns_call(uuid) from public;
revoke all on function public.match_agent_knowledge(uuid, vector(768), text, integer) from public;

grant execute on function public.owns_agent(uuid) to authenticated, service_role;
grant execute on function public.owns_call(uuid) to authenticated, service_role;
grant execute on function public.match_agent_knowledge(uuid, vector(768), text, integer) to authenticated, service_role;

alter table public.users enable row level security;
alter table public.agents enable row level security;
alter table public.agent_knowledge_files enable row level security;
alter table public.agent_knowledge_chunks enable row level security;
alter table public.calls enable row level security;
alter table public.call_messages enable row level security;
alter table public.call_metrics enable row level security;
alter table public.call_insights enable row level security;
alter table public.extracted_leads enable row level security;
alter table public.agent_memory enable row level security;
alter table public.agent_learning_events enable row level security;
alter table public.unanswered_questions enable row level security;
alter table public.call_references enable row level security;

create policy users_own_select on public.users for select using ((select auth.uid()) = id);
create policy users_own_update on public.users for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy agents_own_all on public.agents for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy agent_knowledge_files_own_all on public.agent_knowledge_files for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy agent_knowledge_chunks_own_all on public.agent_knowledge_chunks for all using (public.owns_agent(agent_id)) with check (public.owns_agent(agent_id));
create policy calls_own_all on public.calls for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy call_messages_own_all on public.call_messages for all using (public.owns_call(call_id)) with check (public.owns_call(call_id));
create policy call_metrics_own_all on public.call_metrics for all using (public.owns_call(call_id)) with check (public.owns_call(call_id));
create policy call_insights_own_all on public.call_insights for all using (public.owns_agent(agent_id)) with check (public.owns_agent(agent_id));
create policy extracted_leads_own_all on public.extracted_leads for all using (public.owns_agent(agent_id)) with check (public.owns_agent(agent_id));
create policy agent_memory_own_all on public.agent_memory for all using (public.owns_agent(agent_id)) with check (public.owns_agent(agent_id));
create policy agent_learning_events_own_all on public.agent_learning_events for all using (public.owns_agent(agent_id)) with check (public.owns_agent(agent_id));
create policy unanswered_questions_own_all on public.unanswered_questions for all using (public.owns_agent(agent_id)) with check (public.owns_agent(agent_id));
create policy call_references_own_all on public.call_references for all using (public.owns_agent(agent_id)) with check (public.owns_agent(agent_id));

insert into storage.buckets (id, name, public)
values ('agent-knowledge', 'agent-knowledge', false)
on conflict (id) do nothing;
