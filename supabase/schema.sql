-- Supabase schema for per-user, cross-device checklist boards.
-- Safe to run on a fresh project or over the previous development schema.

create extension if not exists pgcrypto;

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  title text not null default 'Mi tablero',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  board_data jsonb not null default '{}'::jsonb
);

alter table public.boards add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.boards add column if not exists updated_at timestamptz not null default now();
alter table public.boards add column if not exists board_data jsonb not null default '{}'::jsonb;

-- Legacy normalized tables are retained for compatibility but are no longer used by the app.
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
create unique index if not exists boards_owner_id_unique_idx on public.boards(owner_id) where owner_id is not null;

alter table public.boards enable row level security;
alter table public.checklist_lists enable row level security;
alter table public.checklist_tasks enable row level security;

-- Remove all previous policies, including the old development policies that allowed public access.
do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('boards', 'checklist_lists', 'checklist_tasks')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      existing_policy.policyname,
      existing_policy.schemaname,
      existing_policy.tablename
    );
  end loop;
end
$$;

create policy boards_select_own
  on public.boards for select to authenticated
  using (owner_id = (select auth.uid()));

create policy boards_insert_own
  on public.boards for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy boards_update_own
  on public.boards for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy boards_delete_own
  on public.boards for delete to authenticated
  using (owner_id = (select auth.uid()));

-- The client stores lists and tasks inside boards.board_data; deny direct access to legacy tables.
revoke all on public.checklist_lists, public.checklist_tasks from public, anon, authenticated;
