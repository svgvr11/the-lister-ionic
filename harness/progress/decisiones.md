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