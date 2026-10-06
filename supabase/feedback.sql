-- ─────────────────────────────────────────────────────────────────────────────
-- Reportes de comentarios y errores (feedback)
--
-- Idempotente: se puede ejecutar varias veces sobre la misma base. Va separado de
-- schema.sql a propósito; schema.sql es el arranque limpio y este bloque solo añade lo nuevo,
-- para no volver a tocar lo que ya funciona.
--
-- Modelo de seguridad: la tabla NO tiene políticas RLS para anon ni authenticated, y se les
-- revocan los privilegios. Así, aunque un cliente intentara leerla por PostgREST, no podría:
-- solo la Edge Function (service_role) lee y escribe. Si se borra al usuario sin más,
-- user_id quedaría en NULL (ON DELETE SET NULL); por eso la Edge Function
-- `delete-account` elimina primero los reportes del usuario y sus imágenes del
-- bucket y solo después borra al usuario.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

create table if not exists public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  -- NULL cuando la cuenta se elimina sin pasar por `delete-account`: el reporte se
  -- conserva, anonimizado. El borrado de cuenta (`delete-account`) elimina los
  -- reportes y sus imágenes antes de borrar al usuario, así que este NULL solo
  -- cubre eliminaciones fuera de ese flujo.
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('bug', 'suggestion', 'other')),
  message text not null check (char_length(message) between 10 and 2000),
  -- Solo si el usuario quiere que le respondan. Nunca es el correo de la cuenta.
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  diagnostics jsonb not null default '{}'::jsonb,
  -- Lista de rutas dentro del bucket feedback-attachments.
  attachments jsonb not null default '[]'::jsonb,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

-- Rellena por si la tabla ya existía de una versión anterior sin alguna columna.
alter table public.feedback_reports add column if not exists contact_email text;
alter table public.feedback_reports add column if not exists diagnostics jsonb not null default '{}'::jsonb;
alter table public.feedback_reports add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.feedback_reports add column if not exists status text not null default 'new';
alter table public.feedback_reports add column if not exists created_at timestamptz not null default now();

-- Una columna CHECK nueva no se añade a una tabla existente con `add column if not exists`,
-- así que las constraints se crean siempre con un DO, para que no dependan de la vía de entrada.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.feedback_reports'::regclass and conname = 'feedback_reports_user_id_fkey'
  ) then
    alter table public.feedback_reports
      add constraint feedback_reports_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conrelid = 'public.feedback_reports'::regclass and conname = 'feedback_reports_type_check'
  ) then
    alter table public.feedback_reports
      add constraint feedback_reports_type_check
      check (type in ('bug', 'suggestion', 'other'));
  end if;

  if not exists (
    select 1 from pg_constraint where conrelid = 'public.feedback_reports'::regclass and conname = 'feedback_reports_message_check'
  ) then
    alter table public.feedback_reports
      add constraint feedback_reports_message_check
      check (char_length(message) between 10 and 2000);
  end if;

  if not exists (
    select 1 from pg_constraint where conrelid = 'public.feedback_reports'::regclass and conname = 'feedback_reports_contact_email_check'
  ) then
    alter table public.feedback_reports
      add constraint feedback_reports_contact_email_check
      check (contact_email is null or char_length(contact_email) <= 254);
  end if;
end
$$;

-- Índice del límite de frecuencia: cuenta las filas de un usuario por ventana de tiempo.
create index if not exists feedback_reports_user_created_idx
  on public.feedback_reports (user_id, created_at desc);

-- Índice de la purga: busca por fecha, sin importar el usuario.
create index if not exists feedback_reports_created_at_idx
  on public.feedback_reports (created_at);

-- RLS ACTIVO y SIN políticas: con RLS apagada PostgREST no llegaría a la tabla, pero activarla
-- deja la puerta cerrada por si alguien la desactivara más adelante.
alter table public.feedback_reports enable row level security;

-- Y por si acaso, se borra cualquier política que hubiera quedado de una prueba previa.
do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'feedback_reports'
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

-- Sin políticas, la RLS solo protege de verdad si además no hay privilegios. Sin estos revoke,
-- un authenticated podría leer la tabla por PostgREST pese a que no exista ninguna política.
revoke all on table public.feedback_reports from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Bucket privado de adjuntos
--
-- public = false: los objetos no son accesibles por URL. El correo lleva URLs FIRMADAS que
-- caducan a los 7 días, y solo la Edge Function puede firmarlas y borrarlas.
-- Sin políticas para anon ni authenticated: los clientes no leen ni escriben el bucket.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-attachments',
  'feedback-attachments',
  false,
  5242880, -- 5 MB: el mismo total de imágenes que acepta la función.
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Sin políticas del bucket para los roles de cliente.
do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'feedback%'
  loop
    execute format('drop policy if exists %I on %I.%I',
      existing_policy.policyname, existing_policy.schemaname, existing_policy.tablename);
  end loop;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime
--
-- feedback_reports NO se publica en supabase_realtime, a propósito: los reportes son datos
-- personales que no deben empujarse a ningún cliente, y además no hay nada que sincronizar en
-- vivo (los lee y escribe la función). Esta comprobación falla si algún día alguien la añade,
-- para que se note en la consola en lugar de filtrar datos en silencio.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'feedback_reports'
  ) then
    raise exception 'feedback_reports está publicada en supabase_realtime: quítala con alter publication supabase_realtime drop table public.feedback_reports;';
  end if;
end
$$;