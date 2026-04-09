-- Flow briefs: AI-generated flow plans with one entry per email
do $$
begin
  create table if not exists public.flow_briefs (
    id uuid primary key default gen_random_uuid(),
    brand_id uuid not null references public.brands(id) on delete cascade,
    manager_id uuid references public.managers(id) on delete set null,
    name text not null,
    flow_type text not null default 'custom',
    trigger_description text default '',
    source_notes text default '',
    emails jsonb not null default '[]'::jsonb,
    status text not null default 'draft',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
exception
  when duplicate_table then null;
end $$;

do $$
begin
  create index if not exists flow_briefs_brand_idx on public.flow_briefs(brand_id);
  create index if not exists flow_briefs_created_idx on public.flow_briefs(created_at desc);
exception
  when others then null;
end $$;

-- RLS
alter table public.flow_briefs enable row level security;

do $$
begin
  create policy "flow_briefs_read" on public.flow_briefs for select using (auth.role() = 'authenticated');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "flow_briefs_insert" on public.flow_briefs for insert with check (auth.role() = 'authenticated');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "flow_briefs_update" on public.flow_briefs for update using (auth.role() = 'authenticated');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy "flow_briefs_delete" on public.flow_briefs for delete using (auth.role() = 'authenticated');
exception
  when duplicate_object then null;
end $$;
