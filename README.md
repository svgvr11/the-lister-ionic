# Checklist Trello · Angular + Ionic

Clon funcional del tablero mostrado en la referencia, construido con Angular + Ionic.

## Funciones

- Crear listas de checklist.
- Las listas ya no se reordenan arrastrándolas: cada una tiene un **pin** con el color del tema elegido. La lista fijada se dibuja siempre en la primera posición del tablero (arriba a la izquierda) y su pin queda siempre visible; en las demás el pin aparece al pasar el mouse (o al navegar con el teclado) y al pulsarlo reemplaza a la lista fijada. Una lista creada con **Ubicar al inicio del tablero** también arranca fijada.
- Crear tareas dentro de cada lista.
- Marcar/desmarcar tareas.
- Las tareas completadas se tachan y pasan al final.
- Después de 3 tareas completadas aparece **Mostrar más**.
- Eliminar cualquier tarea, completada o pendiente.
- Sincronización del tablero por usuario en Supabase para acceder desde varios dispositivos.
- Persistencia local como fallback cuando Supabase Auth no está configurado.
- Acceso con cuenta de Google mediante Supabase Auth.
- Botón de donación de Ko-fi en el menú de perfil, implementado localmente (sin scripts ni fuentes externas) y con el color del tema de tablero seleccionado. **Solo aparece en la web**: Google Play no admite enlaces externos de donación dentro del APK, así que en la app nativa no se renderiza.
- Botón **Basurero** en el menú de perfil, al lado izquierdo de *Cerrar sesión*, que abre la pantalla de papelera.
- Las listas eliminadas del tablero no se borran al instante: pasan al **basurero** y se eliminan de forma permanente después de **7 días**.
- El basurero muestra la cuenta atrás de cada lista; el color del badge escala a medida que se acerca el borrado (gris → ámbar → rojo) y en el último día la lista se tiñe de rojo.
- Desde el basurero se puede **restaurar** una lista (vuelve al tablero con sus tareas) o **eliminarla permanentemente**, una a una o vaciando todo el basurero.
- El basurero muestra las listas de la más reciente a la más antigua (el orden lo fija la fecha de descarte, por eso no se pueden arrastrar para reordenar).
- En el basurero el título y las tareas son de solo lectura: no se pueden editar. Las tareas completadas conservan el **Mostrar tareas completadas** del tablero, pero el estado es solo visual y no se guarda.
- Cada color de tablero muestra su nombre junto al título "Color del tablero".
- **Enviar comentarios** (botón flotante junto al de "Nueva lista"): reporta un error o una mejora con texto, hasta 5 imágenes e información técnica opcional. Llega por correo con enlaces firmados a las capturas y se conserva 90 días. Ver la sección **Feedback**.
- El botón flotante de comentarios permanece visible junto al FAB de nueva lista; los modales y el menú de perfil lo cubren y lo desactivan hasta cerrarse.
- Los datos se guardan como JSON en una fila por usuario, con Row Level Security (RLS).
- Esquema SQL incluido en `supabase/schema.sql`.

## Requisitos

- Node.js 20.19+ o una versión LTS compatible con Angular 20.
- npm.

## Ejecutar

```bash
npm install
npm start
```

Luego abre la URL que indique Angular CLI (normalmente `http://localhost:4200`).

## Build de producción

```bash
npm run build
```

## Base de datos: Supabase

Elegí Supabase como opción de producción porque entrega PostgreSQL, autenticación, APIs y realtime sin tener que construir un backend completo desde cero.

La autenticación y la sincronización se activan cuando `supabase.url` y `supabase.anonKey` están configurados.

Para habilitar el acceso con Google:

1. Crea un proyecto en Supabase.
2. Ejecuta `supabase/schema.sql` en el SQL Editor. El script crea `boards` con `owner_id` y `board_data`, aplica RLS por usuario, deja un tablero por usuario con la restricción única `boards_owner_id_key` y publica la tabla en `supabase_realtime`.
3. Confirma `supabase.url` y `supabase.anonKey` en `src/environments/environment.ts` con los valores de ese proyecto.
4. En Supabase, habilita Google en Authentication > Sign In / Providers y configura las credenciales OAuth de Google.
5. En Google Cloud, agrega como URI de redirección autorizada la URL de callback que muestra Supabase para el proveedor Google.
6. En Supabase > Authentication > URL Configuration, agrega la URL local y la URL de producción a las URLs de redirección permitidas.
7. Publica `dist/the-lister-ionic/browser/`. Una cuenta existente carga su tablero desde Supabase; en el primer acceso, si hay datos locales guardados para esa cuenta en el dispositivo, se copian al nuevo tablero cloud.

Si las credenciales no están configuradas, la app omite el login y abre el tablero local, sin sincronización multidispositivo. La clave publicable/anon está pensada para el cliente; nunca pongas una `service_role` en el frontend. El tablero sincronizado se guarda íntegro en la columna `boards.board_data`; las tablas normalizadas de listas y tareas que existían al principio se eliminaron de la base el 2026-10-03 y `schema.sql` ya no las crea.

## Feedback

El usuario puede reportar un error o comentar una mejora desde la app (botón flotante junto al
de "Nueva lista"). El reporte se guarda en
Supabase y llega por correo a `feedback@soporte.atenis.app` con enlaces firmados a las capturas.

### Arquitectura

```text
src/app/core/feedback-core.ts              lógica pura compartida (lista blanca, validación,
                                           magic bytes, escape, límite de frecuencia)
src/app/core/recent-errors.ts              buffer circular de los 10 últimos errores
src/app/core/services/diagnostics.service  junta el diagnóstico con lo del entorno
src/app/core/services/feedback-images.ts   re-codifica a 1600 px con canvas (quita EXIF)
src/app/core/services/feedback.service    monta el multipart y llama a la Edge Function
src/app/shared/feedback-modal/             el modal (replica el diálogo de ayuda de Archivo)
supabase/feedback.sql                      tabla, RLS, índices y bucket (SQL manual)
supabase/functions/submit-feedback/        valida, guarda y avisa por correo
supabase/functions/feedback-cleanup/       purga de 90 días
```

La regla del diseño es que **el cliente no es de fiar**: la app valida para no gastar el envío,
pero el servidor repite TODAS las validaciones y vuelve a aplicar la lista blanca del
diagnóstico. El `user_id` sale siempre del JWT (`auth.getUser()`), nunca del cuerpo.

El módulo `feedback-core.ts` está **duplicado carácter por carácter** en
`supabase/functions/_shared/` porque las Edge Functions se despliegan desde `supabase/functions/`
y no importan de `src/`. `npm run test:feedback` falla si las dos copias divergen, así que no
pueden separarse sin que se note.

### Qué se envía y qué no

Solo: tipo, mensaje, correo de contacto (si el usuario lo escribe), hasta 5 imágenes y los
campos técnicos de la lista blanca. **Nunca** títulos o contenido de listas o tareas, el correo
o el nombre de la cuenta, el avatar, tokens, `localStorage` ni la ubicación. La casilla
"Incluir información técnica" viene marcada, y "Ver qué se enviará" muestra el JSON exacto.

### Secretos y despliegue

Secretos (Dashboard > Edge Functions > Secrets, o `supabase secrets set`):

| Secreto | Función | Para qué |
|---|---|---|
| `RESEND_API_KEY` | `submit-feedback` | clave de la API de Resend |
| `FEEDBACK_TO` | `submit-feedback` | destinatario; por defecto `feedback@soporte.atenis.app` |
| `CLEANUP_SECRET` | `feedback-cleanup` | secreto compartido que autoriza la purga |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase.
Ningún secreto está en el repo ni en `src/`.

```bash
supabase functions deploy submit-feedback   # verify_jwt: TRUE  (obligatorio)
supabase functions deploy feedback-cleanup  # verify_jwt: FALSE (la llama pg_cron)
```

`verify_jwt` se fija en Dashboard > Edge Functions > (función) > JWT verification, o en
`supabase/config.toml`:

```toml
[functions.submit-feedback]
verify_jwt = true

[functions.feedback-cleanup]
verify_jwt = false
```

Desde Resend hay que verificar el dominio de `feedback@soporte.atenis.app` para poder enviar desde ahí.

### SQL (ejecutar a mano)

1. `supabase/feedback.sql` en el SQL Editor. Crea `feedback_reports` con RLS activo y **sin**
   políticas para `anon` ni `authenticated`, revoca sus privilegios, crea el bucket privado
   `feedback-attachments` (5 MB, solo png/jpeg/webp) sin políticas, y falla a propósito si
   `feedback_reports` estuviera publicada en Realtime (no debe estarlo).

### Cómo revisar los reportes

Llega un correo a `feedback@soporte.atenis.app` con el mensaje, el tipo, los datos técnicos, el id del
reporte y enlaces firmados a las imágenes. Para consultar la tabla:

```sql
select created_at, type, status, message, contact_email,
       jsonb_array_length(attachments) as imagenes
from public.feedback_reports
order by created_at desc
limit 50;
```

Las imágenes solo se pueden abrir desde los enlaces firmados del correo (caducan a los 7 días);
el bucket es privado y no hay forma de leerlo desde el cliente.

### Retención de 90 días

`feedback-cleanup` borra los reportes con más de `FEEDBACK_RETENTION_DAYS = 90` días y sus
objetos de Storage (con la API de Storage, nunca con un `DELETE` sobre `storage.objects`).
Se llama una vez al día desde `pg_cron` + `pg_net`, con el SQL de `supabase/feedback-cron.sql`
(que también trae la variante con el secreto en el Vault, la recomendada). Nada se programa
automáticamente: es un paso manual.

### Límites reales de las Edge Functions

Investigado para dimensionar los tamaños:

- La página oficial de límites de Supabase **no publica ningún tope de tamaño de petición**.
  Solo memoria (256 MB), duración (150 s en plan gratuito, 400 s en de pago), CPU (2 s),
  tiempo de espera en reposo (150 s) y tamaño del bundle (20 MB por CLI, 5 MB por API).
- Hay antecedentes de despliegues que fallan por encima de ~4 MB **de bundle**, no de petición.
- Un PR de documentación propuso "Max Request: 5GB", que nunca llegó a publicarse.

Por eso **el total de imágenes se bajó a 5 MB** (en vez de los 8 MB del planteamiento): no hay
cifra oficial en la que apoyarse, y quedar muy por debajo de cualquier tope plausible de la
pasarela es más seguro que confiar en un número que nadie ha documentado. Además la app
re-codifica a 1600 px y calidad 0.8 antes de enviar, así que las capturas reales pesan bastante
menos. El pedido completo se corta por `Content-Length` antes de leer el cuerpo, con 1 MB de
margen para las cabeceras y fronteras de multipart.

### Pruebas

```bash
npm run test:feedback
```

Cubre la validación de tipo y longitudes, los magic bytes (un `.exe` renombrado a `.png` se
rechaza), los límites de cantidad y tamaño, la lista blanca del diagnóstico (descarta claves
desconocidas y trunca valores), la sanitización del asunto, el escape de HTML del correo, el
cálculo del límite de frecuencia y la depuración de los errores recientes. La primera comprobación
es que las dos copias de `feedback-core.ts` sigan siendo idénticas.

### Accesibilidad

El modal replica el patrón del diálogo de ayuda de `archive.page.*`: `role="dialog"`,
`aria-modal`, foco inicial en el primer tipo, focus trap, Escape y clic en el fondo cierran
(preguntando si hay texto que perder), y el foco vuelve al botón que lo abrió. Los errores van
en una región `aria-live`, y hay estilos para `prefers-reduced-motion`.

### Desactivar el botón flotante

`FEEDBACK_FAB_ENABLED` en `src/app/core/feedback-core.ts`. A `false` desaparece el botón y nada
más; la entrada del menú de perfil sigue funcionando.

## Estructura

```text
src/app/
├── core/
│   ├── board-themes.ts
│   ├── trash.ts
│   ├── feedback-core.ts
│   ├── recent-errors.ts
│   ├── services/
│   │   ├── auth.guard.ts
│   │   ├── auth.service.ts
│   │   ├── board-session.service.ts
│   │   ├── board.repository.ts
│   │   ├── diagnostics.service.ts
│   │   ├── feedback-images.ts
│   │   ├── feedback.service.ts
│   │   ├── local-board.repository.ts
│   │   └── supabase-board.repository.ts
├── models/
│   └── board.models.ts
├── pages/login/
│   ├── login.page.html
│   ├── login.page.scss
│   └── login.page.ts
├── pages/board/
│   ├── board.page.html
│   ├── board.page.scss
│   └── board.page.ts
├── pages/trash/
│   ├── trash.page.html
│   ├── trash.page.scss
│   └── trash.page.ts
├── shared/feedback-modal/
│   ├── feedback-modal.component.html
│   ├── feedback-modal.component.scss
│   └── feedback-modal.component.ts
├── app.component.ts
└── app.routes.ts
supabase/schema.sql
supabase/feedback.sql
supabase/feedback-cron.sql
supabase/functions/_shared/feedback-core.ts
supabase/functions/submit-feedback/index.ts
supabase/functions/feedback-cleanup/index.ts
```
