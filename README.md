# Checklist Trello · Angular + Ionic

Clon funcional del tablero mostrado en la referencia, construido con Angular + Ionic.

## Funciones

- Crear listas de checklist.
- Crear tareas dentro de cada lista.
- Marcar/desmarcar tareas.
- Las tareas completadas se tachan y pasan al final.
- Después de 3 tareas completadas aparece **Mostrar más**.
- Eliminar cualquier tarea, completada o pendiente.
- Sincronización del tablero por usuario en Supabase para acceder desde varios dispositivos.
- Persistencia local como fallback cuando Supabase Auth no está configurado.
- Acceso con cuenta de Google mediante Supabase Auth.
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
2. Ejecuta `supabase/schema.sql` en el SQL Editor. El script agrega `owner_id` y `board_data`, elimina las policies públicas de desarrollo y aplica RLS por usuario. Las filas antiguas sin dueño quedan inaccesibles por seguridad.
3. Confirma `supabase.url` y `supabase.anonKey` en `src/environments/environment.ts` con los valores de ese proyecto.
4. En Supabase, habilita Google en Authentication > Sign In / Providers y configura las credenciales OAuth de Google.
5. En Google Cloud, agrega como URI de redirección autorizada la URL de callback que muestra Supabase para el proveedor Google.
6. En Supabase > Authentication > URL Configuration, agrega la URL local y la URL de producción a las URLs de redirección permitidas.
7. Publica `dist/checklist-trello-ionic/browser/`. Una cuenta existente carga su tablero desde Supabase; en el primer acceso, si hay datos locales guardados para esa cuenta en el dispositivo, se copian al nuevo tablero cloud.

Si las credenciales no están configuradas, la app omite el login y abre el tablero local, sin sincronización multidispositivo. La clave publicable/anon está pensada para el cliente; nunca pongas una `service_role` en el frontend. El tablero sincronizado usa `boards.board_data`; las tablas antiguas de listas/tareas se conservan pero se dejan sin acceso para los clientes.

## Estructura

```text
src/app/
├── core/services/
│   ├── auth.guard.ts
│   ├── auth.service.ts
│   ├── board.repository.ts
│   ├── local-board.repository.ts
│   └── supabase-board.repository.ts
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
├── app.component.ts
└── app.routes.ts
supabase/schema.sql
```
