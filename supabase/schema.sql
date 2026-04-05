-- LIM Email Workbench Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Pods
create table pods (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamp with time zone default now()
);

-- Managers
create table managers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamp with time zone default now()
);

-- Brands (clients)
create table brands (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  pod_id uuid references pods(id) on delete set null,
  manager_id uuid references managers(id) on delete set null,
  color text not null default '#3B82F6',
  founder text,
  location text not null default '',
  category text not null default '',
  voice text not null default '',
  rules text not null default '',
  audiences text[] default '{}',
  products text[] default '{}',
  notes text not null default '',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Strategies
create table strategies (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid references brands(id) on delete cascade not null,
  name text not null,
  content text not null default '',
  status text not null default 'active',
  created_at timestamp with time zone default now()
);

-- Calendar Items
create table calendar_items (
  id uuid primary key default uuid_generate_v4(),
  strategy_id uuid references strategies(id) on delete cascade not null,
  brand_id uuid references brands(id) on delete cascade not null,
  date date not null,
  name text not null,
  type text not null default 'designed',
  status text not null default 'awaiting_brief',
  manager_name text not null default '',
  brief_content text,
  created_at timestamp with time zone default now()
);

-- Brief History
create table brief_history (
  id uuid primary key default uuid_generate_v4(),
  brand_id uuid references brands(id) on delete cascade not null,
  type text not null,
  form_data jsonb not null default '{}',
  output text not null default '',
  created_at timestamp with time zone default now()
);

-- Indexes
create index idx_brands_pod_id on brands(pod_id);
create index idx_brands_slug on brands(slug);
create index idx_strategies_brand_id on strategies(brand_id);
create index idx_calendar_items_brand_date on calendar_items(brand_id, date);
create index idx_calendar_items_strategy on calendar_items(strategy_id);
create index idx_brief_history_brand on brief_history(brand_id);

-- Row Level Security
alter table pods enable row level security;
alter table managers enable row level security;
alter table brands enable row level security;
alter table strategies enable row level security;
alter table calendar_items enable row level security;
alter table brief_history enable row level security;

-- Policies: all authenticated users can do everything (internal tool)
create policy "Authenticated users full access" on pods for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on managers for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on brands for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on strategies for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on calendar_items for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on brief_history for all using (auth.role() = 'authenticated');

-- Seed default pods
insert into pods (name) values ('Pod 1'), ('Pod 2');

-- Seed default manager
insert into managers (name) values ('Unassigned');
