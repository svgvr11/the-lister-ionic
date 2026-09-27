-- Supabase/PostgreSQL schema for the Checklist Board.
-- Run this in Supabase SQL Editor after creating your project.

create extension if not exists pgcrypto;

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_lists (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  title text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_tasks (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.checklist_lists(id) on delete cascade,
  text text not null,
  completed boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists checklist_lists_board_position_idx on public.checklist_lists(board_id, position);
create index if not exists checklist_tasks_list_position_idx on public.checklist_tasks(list_id, position);

-- Development-friendly policies. For production, replace these with authenticated-user policies.
alter table public.boards enable row level security;
alter table public.checklist_lists enable row level security;
alter table public.checklist_tasks enable row level security;

create policy "dev boards select" on public.boards for select using (true);
create policy "dev boards insert" on public.boards for insert with check (true);
create policy "dev boards update" on public.boards for update using (true);
create policy "dev boards delete" on public.boards for delete using (true);
create policy "dev lists select" on public.checklist_lists for select using (true);
create policy "dev lists insert" on public.checklist_lists for insert with check (true);
create policy "dev lists update" on public.checklist_lists for update using (true);
create policy "dev lists delete" on public.checklist_lists for delete using (true);
create policy "dev tasks select" on public.checklist_tasks for select using (true);
create policy "dev tasks insert" on public.checklist_tasks for insert with check (true);
create policy "dev tasks update" on public.checklist_tasks for update using (true);
create policy "dev tasks delete" on public.checklist_tasks for delete using (true);
