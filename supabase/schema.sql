-- Supabase schema for per-user, cross-device checklist boards.
-- Safe to run on a fresh project or over the previous development schema.

create extension if not exists pgcrypto;

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Mi tablero',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  board_data jsonb not null default '{}'::jsonb
);

alter table public.boards add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.boards add column if not exists updated_at timestamptz not null default now();
alter table public.boards add column if not exists board_data jsonb not null default '{}'::jsonb;

-- Cada usuario tiene exactamente un tablero. En producción la columna ya es NOT
-- NULL, así que esto solo afecta a bases antiguas que aún tuvieran filas sin dueño.
alter table public.boards alter column owner_id set not null;

-- Un tablero por usuario, como restricción real (no un índice parcial): es la que
-- hace fallar con 23505 la creación simultánea desde dos dispositivos, y el
-- cliente la captura para releer el tablero ganador en lugar de sobrescribirlo.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.boards'::regclass
      and conname = 'boards_owner_id_key'
  ) then
    alter table public.boards add constraint boards_owner_id_key unique (owner_id);
  end if;
end
$$;

-- Las tablas normalizadas heredadas (checklist_lists, checklist_tasks) se
-- eliminaron de la base el 2026-10-03; el tablero vive en boards.board_data.

alter table public.boards enable row level security;

-- Remove all previous policies, including the old development policies that allowed public access.
do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'boards'
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

-- La app escucha los INSERT/UPDATE de boards para sincronizar entre dispositivos
-- (SupabaseBoardRepository.startSynchronization). Sin esta línea el canal se
-- suscribe bien pero nunca recibe eventos. Es idempotente porque volver a agregar
-- una tabla ya publicada falla.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'boards'
  ) then
    alter publication supabase_realtime add table public.boards;
  end if;
end
$$;
