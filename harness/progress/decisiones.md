# Registro de decisiones

Decisiones duraderas del proyecto. Cada decisión incluye identificador, fecha, contexto, decisión adoptada, alternativas consideradas, consecuencias y estado.

## Decisiones confirmadas (desde auditoría)

| ID | Fecha | Contexto | Decisión | Alternativas | Consecuencias | Estado |
|---|---|---|---|---|---|---|
| D-001 | 2026-11-04 | Stack del proyecto | Angular 20 (standalone) + Ionic 8 + Capacitor 8 | React Native, Flutter, Vue | Código compartido web/Android; Angular 20 reciente | Vigente |
| D-002 | 2026-11-04 | Backend | Supabase (Auth, PostgreSQL + RLS, Realtime, Storage, Edge Functions) | Firebase, AWS Amplify, backend propio | No hay backend propio; RLS protege datos; auth Google | Vigente |
| D-003 | 2026-11-04 | Autenticación | Solo Google OAuth (PKCE), `prompt: select_account` | Email/password, Apple, Microsoft | Solo Google; deep link nativo configurado | Vigente |
| D-004 | 2026-11-04 | Almacenamiento board | `boards.board_data` JSONB, una fila por usuario | Tablas normalizadas (listas, tareas) | Tablas heredadas eliminadas 2026-10-03; flexibilidad JSONB | Vigente |
| D-005 | 2026-11-04 | Versionado | `MAYOR.FEATURE.BUILD-a` en `src/app/core/app-version.ts` | SemVer simple, CalVer | Usuario decide tipo de bump por tarea; Android `versionCode` derivado | Vigente |
| D-006 | 2026-11-04 | Git | Usuario controla ramas, commits, push, merge | Agente con permisos de Git | Agente nunca toca Git; sugiere mensaje de commit | Vigente |
| D-007 | 2026-11-04 | Zona horaria | Dispositivo en producción; fijas solo en tests | Zona fija `America/Santiago` | Determinismo en tests; dispositivo en prod | Vigente |
| D-008 | 2026-11-04 | Estructura `src/app/` | core/ (lógica pura), guards/, models/, pages/, services/, shared/components/ | Otra organización | Páginas solo componen; lógica pura extraída a core/ | Vigente |
| D-009 | 2026-11-04 | Testing | Vitest vía `@angular/build:unit-test`; specs junto al código | Jest, Cypress, Playwright E2E | `vi.mock` no funciona; mocks via inyección | Vigente |
| D-010 | 2026-11-04 | Feedback core duplicado | `src/.../feedback-core.ts` ≡ `supabase/functions/_shared/feedback-core.ts` | Importar desde `src/` | `test:feedback` verifica identidad byte a byte | Vigente |
| D-011 | 2026-11-04 | Basurero | 7 días, purga automática, cuenta atrás con colores | Otro plazo, sin purga | 7 días confirmado en README y código | Vigente |
| D-012 | 2026-11-04 | Archivo | 60 días, solo listas 100% completas | Otro plazo, cualquier lista | 60 días confirmado | Vigente |
| D-013 | 2026-11-04 | Reordenamiento | Escritorio HTML5; táctil CDK con `mixed` orientación | Migrar escritorio a CDK | Descartado por conflicto con masonry `position:absolute` | Vigente |
| D-014 | 2026-11-04 | Sincronización | Last-write-wins con versión optimista (`updated_at`) | CRDT, bloqueo pesado | Coalescing de guardados; diálogo de conflicto | Vigente |

## Decisiones en revisión

(Ninguna pendiente de revisión en este momento)

### D-015 — Plan T-001 aprobado con condiciones (C1-C9)

- **Fecha**: 2026-11-04
- **Contexto**: Tarea T-001 (investigación y plan) aprobada con condiciones antes de iniciar T-002.
- **Decisión adoptada**:
  - C1: Portal CDK a `document.body` aprobado; variables de tema (`--accent`, `--card-surface`, `--fab-color`, `--fab-hover`, `--on-accent`) viven en `:host` de board.page y no llegan al portal → pasar al sheet vía helper puro en `core/ui` con spec.
  - C2: CDK Overlay necesita estilos base y contenedor con z-index 1000 → resolver con tokens; avisar antes de tocar `angular.json`.
  - C3: Modo móvil único aprobado; conserva snapshot al abrir (como `newListMobilePresentation`) y migra los otros usos de `isMobilePresentation` en board.page.
  - C4: FABs se quedan en board.page fuera de `<ion-content>`; `pages/notes` emite `editorOpen` y board.page lo usa en `boardModalOpen` (inert), `setContentView`, guards y `[open]` del FAB.
  - C5: Overlay-stack auto-registro aprobado, `dismissible = !editorBusy` (no "sin cambios sin guardar"); `closeTop()` saca entrada antes de llamar a close(); verificar orden frente a `syncOverlayStack` en `ngDoCheck` y retirar `board:new-list` cuando el sheet lo asuma.
  - C6: T-005 propone token nuevo y espera validación, agrupando dudas en una sola pregunta.
  - C7: Clic en fondo del editor de nota se alinea con Nueva lista (cierra solo si no hay título, texto ni adjuntos nuevos).
  - C8: T-004 se divide en T-004a (componente + specs) y T-004b (migrar Nueva lista, verificar idéntica, luego Nueva nota). Ignorar estimados en días.
  - C9: board.page es el shell de facto; extraerse al llegar estado Todo (#/all). Registrado como pendiente, no se hace ahora.
- **Alternativas consideradas**: host de page para sheet (descartado por C1/C2); `dismissible` sin cambios sin guardar (descartado por C5).
- **Consecuencias**: `sheet-dialog` auto-registra en `OverlayStackService`; FABs permanecen en board.page; T-004 fraccionado.
- **Estado**: vigente


## Decisiones sustituidas

(Ninguna en este momento)

---

**Formato para nuevas decisiones**:

```
### D-XXX — [Título]

- **Fecha**: YYYY-MM-DD
- **Contexto**: descripción de la situación.
- **Decisión adoptada**: qué se decidió.
- **Alternativas consideradas**: qué se evaluó y por qué se descartó.
- **Consecuencias**: impacto de la decisión.
- **Estado**: vigente / sustituida / pendiente de revisión.