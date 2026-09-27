# Checklist Trello · Angular + Ionic

Clon funcional del tablero mostrado en la referencia, construido con Angular + Ionic.

## Funciones

- Crear listas de checklist.
- Crear tareas dentro de cada lista.
- Marcar/desmarcar tareas.
- Las tareas completadas se tachan y pasan al final.
- Después de 3 tareas completadas aparece **Mostrar más**.
- Eliminar cualquier tarea, completada o pendiente.
- Persistencia inmediata en `localStorage` para que el proyecto funcione sin configuración externa.
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

El proyecto viene configurado para **funcionar inmediatamente con localStorage**. Esto permite probarlo sin crear una cuenta ni configurar credenciales.

Para conectarlo a Supabase:

1. Crea un proyecto en Supabase.
2. Ejecuta `supabase/schema.sql` en el SQL Editor.
3. Copia `src/environments/environment.example.ts` como `src/environments/environment.ts` y completa `url` y `anonKey`.
4. Cambia el proveedor de `LocalBoardRepository` por `SupabaseBoardRepository` en `BoardPage`.
5. Para producción, sustituye las policies de desarrollo del SQL por policies basadas en `auth.uid()`.

> Nota: la clase Supabase incluida es la base de persistencia; para una aplicación multiusuario conviene añadir `owner_id`/membresías y RLS por usuario antes de desplegarla.

## Estructura

```text
src/app/
├── core/services/
│   ├── board.repository.ts
│   ├── local-board.repository.ts
│   └── supabase-board.repository.ts
├── models/
│   └── board.models.ts
├── pages/board/
│   ├── board.page.html
│   ├── board.page.scss
│   └── board.page.ts
├── app.component.ts
└── app.routes.ts
supabase/schema.sql
```
