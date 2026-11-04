# Arquitectura — The Lister

## Resumen

Aplicación Angular 20 (standalone components) + Ionic 8 + Capacitor 8. Misma base de código para web y APK Android. Backend en Supabase (Auth, PostgreSQL + RLS, Realtime, Storage, Edge Functions).

## Diagrama de arquitectura

```mermaid
graph TB
    subgraph Cliente["Cliente (Web + Android)"]
        UI[Páginas Ionic / Componentes compartidos]
        Core[Lógica pura core/ (sin DI)]
        Services[Servicios Angular DI]
        Guards[Guardias de ruta]
        LocalStorage[(localStorage: tema, bienvenida, auth token)]
    end

    subgraph Supabase["Supabase (Backend)"]
        Auth[Auth: Google OAuth PKCE]
        DB[(PostgreSQL: boards JSONB + RLS)]
        Realtime[Realtime: sincronización boards]
        Storage[Storage privado: adjuntos notas + feedback]
        EF1[Edge Function: submit-feedback]
        EF2[Edge Function: feedback-cleanup]
    end

    subgraph Externo["Servicios externos"]
        Google[Google OAuth]
        Resend[Resend: envío correo feedback]
        Play[Google Play: distribución AAB]
    end

    UI --> Core
    UI --> Services
    Services --> Core
    Guards --> Services
    Services --> Auth
    Services --> DB
    Services --> Realtime
    Services --> Storage
    Services --> EF1
    Core --> LocalStorage
    Auth --> Google
    EF1 --> Resend
    UI --> Play
```

## Capas y responsabilidades

### `core/` — Lógica pura (sin Angular DI, sin DOM)

Dominios actuales: `auth`, `board`, `feedback`, `list`, `platform`, `ui`.

Cada dominio es una carpeta con módulos `<nombre>/<nombre>.ts` + `<nombre>.spec.ts`. Funciones puras, probables en Node sin levantar Angular.

Excepción: `core/app-version.ts` vive en la raíz de `core/` (única fuente de versión).

### `guards/` — Guardias de ruta

`auth.guard.ts`: protege rutas que requieren sesión.

### `models/` — Interfaces y tipos

`board.model.ts`: `ChecklistBoard`, `ChecklistList`, `ChecklistTask`, `BoardNote`, `BoardNoteAttachment`, `ChecklistTrashedList`, `ChecklistArchivedList`.

### `pages/` — Páginas (solo componen)

`login`, `board`, `trash`, `archive`, `privacy`, `terms`. Cada una con `.page.ts`, `.html`, `.scss`.

### `services/` — Servicios con Angular DI

- `auth.service.ts`: cliente Supabase, login Google, logout, delete account.
- `board-session.service.ts`: elige repositorio (local/Supabase), inicializa tablero.
- `board.repository.ts`: interfaz abstracta del repositorio de tableros.
- `local-board.repository.ts`: persistencia local (IndexedDB/localStorage fallback).
- `supabase-board.repository.ts`: sincronización con Supabase, realtime, coalescing de guardados, versión optimista.
- `feedback.service.ts`: envía feedback a Edge Function.
- `session-guard.service.ts`: bloqueo de pestaña por cambio de sesión en otra pestaña.
- `overlay-stack.service.ts`: gestión de overlays modales.
- `connectivity.service.ts`, `diagnostics.service.ts`, `note-attachment.service.ts`, `mock-board.session.service.ts`, `mock-auth.service.ts`.

### `shared/components/` — Componentes standalone reutilizables

`app-footer`, `add-task-input`, `inline-edit`, `feedback-modal`, `notes-workspace`, `welcome-modal`, `legal-page`.

## Datos y persistencia

- Tablero: `boards.board_data` (JSONB) en Supabase, una fila por usuario (`owner_id` único).
- Fallback local: `LocalBoardRepository` cuando no hay credenciales Supabase o no hay sesión.
- Tema y bienvenida: `localStorage` por dispositivo (no sincronizado).
- Auth token: `sb-*-auth-token` en localStorage (compartido cross-tab por Supabase).

## Sincronización

- Last-write-wins con versión optimista (`updated_at`).
- Coalescing: guardados concurrentes se fusionan en uno solo.
- Realtime como señal; refresco al volver a primer plano, throttle 3 s.
- Conflicto: edición, borrado o reorden concurrente → diálogo de conflicto (`board-merge.ts`).
- Eco propio detectado con `canonicalBoardContentKey`.
- Actualizaciones remotas retenidas mientras hay edición activa, arrastre o guardado.

## Seguridad

- RLS activo en `boards`; políticas solo `authenticated` con `owner_id = auth.uid()`.
- `owner_id` NOT NULL, único, FK con `ON DELETE CASCADE`.
- Cliente Supabase con `anonKey` (nunca `service_role` en frontend).
- Edge Function `delete-account` usa `service_role` solo en servidor.
- Feedback: diagnóstico con lista blanca; sin contenido de listas/tareas/correo/tokens.
- Storage privado para adjuntos; políticas por `owner_id`.

## Reordenamiento de listas

- Escritorio (>700px): HTML5 drag con handle al hover.
- Táctil / ≤700px / nativo: `@angular/cdk/drag-drop` con pulsación larga, orientación `mixed`, auto-scroll propio.
- `LIST_REORDER_ENGINE` como interruptor de retorno.
- Pinned list inmovil; nada se coloca delante de ella.

## Layout y UI

- Masonry por JS con columnas según ancho del contenedor e histéresis.
- Flujo normal en una columna (masonry desactivado).
- Vista Tarjetas solo en nativo.
- Menú de perfil: popover en escritorio, bottom sheet en móvil.
- Botón flotante de feedback siempre visible, inerte bajo modales.
- Colores solo desde variables del tema.

## Feedback

- Cliente valida (tipo, mensaje 10-2000 chars, hasta 5 imágenes, 5 MB total).
- Servidor revalida todo (Edge Function `submit-feedback`, JWT verificado).
- Imágenes recodificadas en cliente (1600 px, calidad 0.8, EXIF eliminado).
- Storage privado `feedback-attachments`; retención 90 días.
- Rate limit: 5/hora, 20/día.
- Correo por Resend a `feedback@soporte.atenis.app`.
- Edge Function `feedback-cleanup`: purga de 90 días, secreto compartido, pg_cron diario.

## Versionado

- Fuente: `src/app/core/app-version.ts` (`MAYOR.FEATURE.BUILD-a`).
- `npm run version:bump -- --major|--feature|--build`.
- Android: `scripts/android-version.mjs` genera `android/app/version.properties` (`versionCode = MAYOR*1_000_000 + FEATURE*1_000 + BUILD`).
- Límites: `MAYOR ≤ 2099`, `FEATURE ≤ 999`, `BUILD ≤ 999`.

## Build y despliegue

- `npm run build`: build de producción Angular.
- `npm run bundle`: build + sync Android version + `.aab` firmado.
- `npm run apk`: build debug + APK.
- `npm run bundle:check`: verifica firma del `.aab` con `jarsigner`.
- `npm run start:mock`: modo mock (sesión demo + fixture en memoria, sin Supabase).

## Pruebas

- Vitest vía `@angular/build:unit-test` (`ng test`), 578 casos.
- Specs junto al código (`*.spec.ts`).
- `vi.mock` no funciona en este builder; mocks via inyección (tokens, `useValue`).
- Scripts `.mjs` como `test:legacy` (feedback, delete-account, version, android-version, apk-name).
- Regla: todo cambio de lógica incluye su test.
- Playwright MCP para verificación UI manual (`npm run start:mock`, `http://localhost:4200/#/board`).

## Puntos de extensión protegidos (no modificar sin autorización)

- Stack, routing, backend Supabase, Auth Google, versionado, Git, zona horaria, estructura `src/app/`, duplicación feedback-core.