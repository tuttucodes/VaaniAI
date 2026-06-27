create unique index if not exists call_insights_call_id_unique_idx on public.call_insights (call_id);

create index if not exists calls_phone_trgm_idx on public.calls using gin (phone_number gin_trgm_ops);
create index if not exists calls_summary_trgm_idx on public.calls using gin (summary gin_trgm_ops);
create index if not exists call_messages_content_trgm_idx on public.call_messages using gin (content gin_trgm_ops);
create index if not exists extracted_leads_name_trgm_idx on public.extracted_leads using gin (name gin_trgm_ops);
create index if not exists extracted_leads_company_trgm_idx on public.extracted_leads using gin (company gin_trgm_ops);

drop policy if exists agent_knowledge_storage_select on storage.objects;
drop policy if exists agent_knowledge_storage_insert on storage.objects;
drop policy if exists agent_knowledge_storage_update on storage.objects;
drop policy if exists agent_knowledge_storage_delete on storage.objects;

create policy agent_knowledge_storage_select
on storage.objects for select
using (
  bucket_id = 'agent-knowledge'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy agent_knowledge_storage_insert
on storage.objects for insert
with check (
  bucket_id = 'agent-knowledge'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy agent_knowledge_storage_update
on storage.objects for update
using (
  bucket_id = 'agent-knowledge'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'agent-knowledge'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy agent_knowledge_storage_delete
on storage.objects for delete
using (
  bucket_id = 'agent-knowledge'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
