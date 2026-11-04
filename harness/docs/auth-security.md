# Autenticación y seguridad — The Lister

## Autenticación

### Proveedor

- Único proveedor: **Google OAuth** vía Supabase Auth.
- Flujo: PKCE (`flowType: 'pkce'`).
- `prompt: 'select_account'`: obliga a Google a mostrar siempre el selector de cuenta.
- Web: redirect en `window.location.origin`.
- Nativo (Android): navegador del sistema, deep link `dev.vmunoz.thelister://auth/callback`.

### Cliente Supabase

- Inyectable vía token `SUPABASE_CLIENT` (permite mock en tests).
- Se crea solo si `supabase.url` y `supabase.anonKey` están configurados y no contienen placeholders.
- Si no hay credenciales: app en modo local (sin sincronización).
- Nunca se usa `service_role` en el frontend.

### Session guard (cross-tab)

- `src/app/core/auth/session-guard/session-guard.ts`: lógica pura, sin dependencias.
- Supabase comparte sesión por localStorage (`sb-*-auth-token`) entre pestañas.
- Si otra pestaña cierra sesión o entra con otra cuenta, la pestaña actual se bloquea (modal pegajoso).
- `markLocalAuthChange()` / `consumeLocalAuthChange()`: marca cambios propios para no bloquearse a sí misma.
- `SessionGuardService`: parte reactiva (signals, listeners).

### Eliminar cuenta

- Edge Function `delete-account` (verifica JWT).
- Usa `service_role` solo en servidor.
- Solo visible en app nativa (requisito Google Play).
- Reintento: ante 401, refresca sesión y reintenta UNA vez.
- 401 persistente → cierra sesión local, nunca trata como éxito.
- Red o 5xx → sesión intacta, mensaje claro.

## Autorización (RLS)

Tabla `public.boards`:
- Políticas `boards_select_own`, `boards_insert_own`, `boards_update_own`, `boards_delete_own`.
- Todas requieren `authenticated` y `owner_id = (select auth.uid())`.
- `owner_id`: NOT NULL, único, FK con `ON DELETE CASCADE`.

Bucket `note-attachments`:
- Políticas `note_attachments_read_own`, `note_attachments_upload_own`, `note_attachments_delete_own`.
- `split_part(name, '/', 1) = (select auth.uid()::text)`.

## Secretos

| Secreto | Dónde | Para qué |
|---|---|---|
| `RESEND_API_KEY` | Supabase Edge Functions secrets | Envío correo feedback |
| `FEEDBACK_TO` | Supabase Edge Functions secrets | Destinatario (default: `feedback@soporte.atenis.app`) |
| `CLEANUP_SECRET` | Supabase Edge Functions secrets | Autoriza purga de feedback |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Inyectado por Supabase | Cliente Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Inyectado por Supabase | Edge Functions servidor |

Ningún secreto en el repo ni en `src/`. `environment.ts` y `environment.prod.ts` están gitignored.

## Feedback (cliente → servidor)

- Cliente valida: tipo, mensaje (10-2000 chars), hasta 5 imágenes, 5 MB total, diagnóstico con lista blanca.
- Servidor revalida TODO (Edge Function `submit-feedback`, JWT verificado).
- Imágenes: recodificadas en cliente (1600 px, calidad 0.8, EXIF eliminado), magic bytes para verificar tipo real.
- Diagnóstico: sin títulos/contenido de listas o tareas, sin correo/nombre de cuenta, sin avatar, sin tokens, sin localStorage, sin ubicación.
- Storage privado `feedback-attachments`; retención 90 días.
- Rate limit: 5 reportes/hora, 20/día.
- Correo por Resend con enlaces firmados (TTL 7 días).

## Feedback cleanup

- Edge Function `feedback-cleanup` (verify_jwt: FALSE, llamado por pg_cron).
- Secreto compartido `CLEANUP_SECRET`.
- Borra reportes > 90 días y sus objetos de Storage (API de Storage, nunca DELETE sobre storage.objects).
- pg_cron diario (paso manual, no automático).

## Zonas horarias

- Producción: zona del dispositivo (`Intl.DateTimeFormat().resolvedOptions().timeZone`).
- Nunca se fija `America/Santiago` ni otra en código de producción.
- Zonas fijas solo en tests (para determinismo).

## Lo que no debe cambiarse sin autorización

- Proveedor de auth (solo Google).
- RLS políticas y esquema de `boards`.
- Uso de `anonKey` vs `service_role` en frontend.
- Secretos y su ubicación.
- Duplicación feedback-core (app ≡ Edge Functions).