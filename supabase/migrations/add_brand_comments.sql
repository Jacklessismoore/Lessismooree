-- brand_comments: lightweight notes/comments attached to a brand.
-- These are surfaced in the brand context passed to every brief and strategy
-- generation so recent client conversations influence the output.

create table if not exists public.brand_comments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_email text,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists brand_comments_brand_idx on public.brand_comments(brand_id);
create index if not exists brand_comments_created_idx on public.brand_comments(created_at desc);

alter table public.brand_comments enable row level security;

drop policy if exists "brand_comments_read" on public.brand_comments;
create policy "brand_comments_read" on public.brand_comments
  for select using (auth.role() = 'authenticated');

drop policy if exists "brand_comments_insert" on public.brand_comments;
create policy "brand_comments_insert" on public.brand_comments
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "brand_comments_delete" on public.brand_comments;
create policy "brand_comments_delete" on public.brand_comments
  for delete using (auth.role() = 'authenticated');
