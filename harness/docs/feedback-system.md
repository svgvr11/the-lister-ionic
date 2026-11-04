# Sistema de feedback — The Lister

## Flujo general

El usuario reporta un error o sugiere una mejora desde el botón flotante de feedback (junto al FAB de "Nueva lista") o desde el menú de perfil. El reporte se valida en cliente, se envía a la Edge Function `submit-feedback`, que lo guarda en Supabase y avisa por correo vía Resend.

## Validación en cliente

| Campo | Reglas |
|---|---|
| Tipo | `bug` \| `suggestion` \| `other` (primero por defecto) |
| Mensaje | 10-2000 caracteres (tras trim) |
| Contacto email | Opcional, máx 254 chars, formato válido si se escribe |
| Imágenes | Máx 5, máx 2 MB cada una, máx 5 MB total |
| Diagnóstico | Lista blanca; sin contenido de listas/tareas, correo, nombre, avatar, tokens, localStorage, ubicación |

Tipos de imagen aceptados (magic bytes, no extensión): PNG, JPEG, WEBP.

## Archivo compartido (duplicación byte a byte)

`src/app/core/feedback/feedback-core/feedback-core.ts` ≡ `supabase/functions/_shared/feedback-core.ts`

- `npm run test:feedback` falla si las dos copias divergen.
- Lógica pura: sin Angular, sin Capacitor, sin Deno, sin `window`.
- Validación, magic bytes, sanitización, rate limit, escape HTML, construcción de correo.

## Edge Functions

### submit-feedback

- `verify_jwt: TRUE` (obligatorio).
- Valida todo de nuevo (cliente no es de fiar).
- Guarda en `feedback_reports` (RLS activo, sin políticas para anon/authenticated, privilegios revocados).
- Guarda imágenes en bucket privado `feedback-attachments` (5 MB, solo png/jpeg/webp).
- Envía correo por Resend con enlaces firmados a las imágenes (TTL 7 días).
- Secreto `RESEND_API_KEY`, `FEEDBACK_TO`.

### feedback-cleanup

- `verify_jwt: FALSE` (llamada por pg_cron).
- Secreto `CLEANUP_SECRET`.
- Borra reportes > 90 días (`FEEDBACK_RETENTION_DAYS = 90`) y sus objetos de Storage.
- SQL en `supabase/feedback-cron.sql` (variante con secreto en Vault, recomendada).
- Paso manual, no automático.

## Límites reales

- Supabase no publica tope de tamaño de petición para Edge Functions.
- Memoria 256 MB, duración 150 s (gratis) / 400 s (pago), CPU 2 s, bundle 20 MB (CLI) / 5 MB (API).
- Total de imágenes bajado a 5 MB (de 8 MB iniciales) por precaución.
- `Content-Length` corta el pedido con 1 MB de margen para cabeceras y fronteras multipart.

## Retención

- Reportes: 90 días.
- Imágenes: enlaces firmados caducan a los 7 días.
- Limpieza: `feedback-cleanup` + pg_cron diario.

## Rate limit

- 5 reportes/hora, 20/día por usuario.
- Ventanas deslizantes basadas en `created_at`.

## Lo que no entra en el feedback (nunca sale del dispositivo)

- Títulos o contenido de listas y tareas.
- Correo o nombre de la cuenta.
- Avatar.
- Tokens.
- Contenido de localStorage.
- Ubicación.

## Desactivar botón flotante

- `FEEDBACK_FAB_ENABLED` en `feedback-core.ts` (`true` por defecto).
- A `false`: desaparece el botón; la entrada del menú de perfil sigue funcionando.