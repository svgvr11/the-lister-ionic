-- ─────────────────────────────────────────────────────────────────────────────
-- Purga automática de reportes (pg_cron + pg_net)
--
-- EJECUTAR A MANO, después de desplegar `feedback-cleanup` y de guardar el secreto
-- CLEANUP_SECRET. Nada de esto se programa solo: es un paso manual y explícito.
--
-- Antes de ejecutarlo:
--   1) supabase functions deploy feedback-cleanup --no-verify-jwt
--   2) supabase secrets set CLEANUP_SECRET='<un valor largo y aleatorio>'
--   3) Guardar ese MISMO valor en el Vault (ver paso 1 más abajo), en una
--      ejecución aparte del SQL Editor. NO escribas el valor real en este archivo.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── Variante A: el secreto va en el Vault (recomendada) ─────────────────────
--
-- Paso 1 (EJECUTAR APARTE, UNA SOLA VEZ, con el valor real; no lo commitees):
--
--   select vault.create_secret(
--     'AQUI-EL-VALOR-REAL',            -- 1.º argumento: el VALOR (igual al de secrets set)
--     'CLEANUP_SECRET',                -- 2.º argumento: el NOMBRE
--     'Llamada de pg_cron a feedback-cleanup'   -- 3.º: descripción
--   );
--
-- Comprobación (no muestra el valor):
--   select name, created_at from vault.secrets where name = 'CLEANUP_SECRET';
--
-- Paso 2: ejecutar desde aquí hacia abajo.

create or replace function public.feedback_cleanup_job()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  secreto text;
  url text := 'https://gbncrufredtqpixygzzu.supabase.co/functions/v1/feedback-cleanup';
begin
  select decrypted_secret into secreto from vault.decrypted_secrets where name = 'CLEANUP_SECRET';
  if secreto is null then
    raise exception 'Falta el secreto CLEANUP_SECRET en el Vault';
  end if;

  return net.http_post(
    url := url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-secret', secreto
    ),
    body := '{}'::jsonb
  );
end
$$;

-- Diario a las 03:17 (minuto 17 para no coincidir con otros trabajos que usan :00).
select cron.schedule(
  'feedback-cleanup-daily',
  '17 3 * * *',
  $$ select public.feedback_cleanup_job(); $$
);

-- ── Comprobaciones ──────────────────────────────────────────────────────────

-- El job quedó registrado:
-- select jobname, schedule, active from cron.job where jobname = 'feedback-cleanup-daily';

-- Probar la purga a mano, sin esperar al cron:
--   curl -X POST \
--     -H "x-cleanup-secret: EL-MISMO-SECRETO" \
--     https://gbncrufredtqpixygzzu.supabase.co/functions/v1/feedback-cleanup
--   -> {"ok":true,"deleted":0,"objects":0}

-- Quitar la programación (la función y el secreto se pueden dejar):
-- select cron.unschedule('feedback-cleanup-daily');