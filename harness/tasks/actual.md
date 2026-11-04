# Tarea activa

## T-001 — Investigación y plan, sin cambios de código

**Objetivo:** Confirmar la auditoría (hallazgos H1-H9) contra el código y el navegador, y proponer un plan de implementación que el usuario apruebe antes de tocar código.

**Contexto:** Base `claude/01-auditoria-ui-fab-y-modales.md` (snapshot v1.64.5-a, 2026-11-04). El FAB de Notas no gira y queda sobre el modal; el modal de Nueva nota es otra implementación del bottom sheet. Causa del FAB sobre el modal: `<app-notes-workspace>` vive dentro de `<ion-content>` y su `position: fixed; z-index: 1200` queda atrapado en el contexto de apilamiento del scroller de Ionic, mientras el FAB está fuera con `--z-content-fab` (200). `board.page.html` ya documenta esta restricción en el comentario sobre overlays a nivel de página.

**Alcance:** Confirmación o corrección de cada hallazgo H1-H9 con evidencia; descripción exacta del FAB de lista (ícono, giro, estado abierto) en escritorio y móvil; propuesta de arquitectura (dónde renderizan FAB y sheet respecto de `<ion-content>`, API del FAB/sheet/botones, registro en `OverlayStackService`, fuente única del modo móvil, cómo se monta `pages/notes` bajo el toggle y su contrato, división de `notes-workspace` en componentes compartidos); recomendación por decisión con alternativas y riesgos; decisiones que necesitan aprobación del usuario; orden y tamaño estimado de las tareas 2-6.

**Fuera de alcance:** cualquier cambio de código, versión o rutas.

**Archivos o módulos relevantes:** `claude/01-auditoria-ui-fab-y-modales.md`, `src/app/pages/board/board.page.*`, `src/app/shared/components/notes-workspace/notes-workspace.component.*`, `src/app/core/board/board-content-view`, `harness/docs/architecture.md`.

**Restricciones:** No se modifica código, no se pide tipo de subida de versión (no se modifica código), ninguna versión tocada.

**Criterios de aceptación:** Plan entregado y aprobado por el usuario; `actual.md` y `pendientes.md` actualizados; nada más modificado.

**Pruebas requeridas:** Ninguna (tarea de documentación e investigación).

**Estado:** en curso
