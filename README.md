# Checklist Trello · Angular + Ionic

Clon funcional del tablero mostrado en la referencia, construido con Angular + Ionic.

## Funciones

- Crear listas de checklist.
- Crear tareas dentro de cada lista.
- Marcar/desmarcar tareas.
- Las tareas completadas se tachan y pasan al final.
- Después de 3 tareas completadas aparece **Mostrar más**.
- Eliminar cualquier tarea, completada o pendiente.
- Persistencia inmediata del tablero en `localStorage`.
- Acceso con cuenta de Google mediante Supabase Auth.
- Los datos del tablero se guardan localmente y se separan por cuenta en el mismo navegador.
- Repositorio separado para poder migrar a Supabase.
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

La autenticación se activa cuando `supabase.url` y `supabase.anonKey` están configurados. El tablero se guarda en `localStorage`; no se sincroniza con la base de datos.

Para habilitar el acceso con Google:

1. Crea un proyecto en Supabase.
2. Completa `supabase.url` y `supabase.anonKey` en `src/environments/environment.ts` con la URL del proyecto y la clave publicable/anon.
3. En Supabase, habilita Google en Authentication > Sign In / Providers y configura las credenciales OAuth de Google.
4. En Google Cloud, agrega como URI de redirección autorizada la URL de callback que muestra Supabase para el proveedor Google.
5. En Supabase > Authentication > URL Configuration, agrega la URL local (incluido el puerto que usa `ng serve`) y la URL de producción a las URLs de redirección permitidas.
6. `/login` ofrece Google como único método. El tablero continúa en `localStorage`; cada cuenta comienza con un tablero vacío en ese navegador.

Si las credenciales no están configuradas, la app omite el login y abre el tablero local. La clave publicable/anon está pensada para el cliente; nunca pongas una `service_role` en el frontend. Para sincronizar tableros en la nube se debe completar el repositorio Supabase con propiedad por usuario y políticas RLS antes de desplegar.

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
