-- Launchpad Portal — Database Migration
-- Run this against the existing Supabase project: gghsrjcvclcdtytfsitm.supabase.co
-- Execute via Supabase Dashboard → SQL Editor

-- ============================================================
-- Table: projects
-- ============================================================
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  company_name text not null,
  project_name text not null,
  type text not null check (type in ('investor_pitch', 'client_proposal', 'product_launch', 'other')),
  status text not null default 'requested' check (status in ('requested', 'in_progress', 'review', 'revision', 'live', 'on_hold')),
  pitchapp_url text,
  target_audience text,
  materials_link text,
  timeline_preference text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- Table: scout_messages
-- ============================================================
create table if not exists scout_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  edit_brief_md text,
  created_at timestamptz default now()
);

-- ============================================================
-- Table: notifications
-- ============================================================
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  project_id uuid references projects(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  read boolean default false,
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

-- Projects: clients see only their own
alter table projects enable row level security;

create policy "clients_own_projects_select" on projects
  for select using (auth.uid() = user_id);

create policy "clients_own_projects_insert" on projects
  for insert with check (auth.uid() = user_id);

create policy "clients_own_projects_update" on projects
  for update using (auth.uid() = user_id);

-- Scout messages: clients see messages for their own projects
alter table scout_messages enable row level security;

create policy "clients_own_messages_select" on scout_messages
  for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );

create policy "clients_own_messages_insert" on scout_messages
  for insert with check (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Notifications: clients see and update their own
alter table notifications enable row level security;

create policy "clients_own_notifications_select" on notifications
  for select using (auth.uid() = user_id);

create policy "clients_update_own_notifications" on notifications
  for update using (auth.uid() = user_id);

-- Notifications are inserted by the server (service role bypasses RLS).
-- This policy allows service-role inserts; no client-side insert needed.
create policy "service_role_insert_notifications" on notifications
  for insert with check (true);

-- ============================================================
-- Indexes
-- ============================================================
create index if not exists idx_projects_user_id on projects(user_id);
create index if not exists idx_projects_status on projects(status);
create index if not exists idx_scout_messages_project_id on scout_messages(project_id);
create index if not exists idx_notifications_user_id on notifications(user_id);
create index if not exists idx_notifications_read on notifications(user_id, read);

-- ============================================================
-- Auto-update updated_at on projects
-- ============================================================
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at_column();
