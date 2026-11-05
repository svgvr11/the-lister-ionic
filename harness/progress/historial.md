# Historial de avances

Registro cronológico breve de hitos importantes: implementaciones relevantes, problemas, correcciones y validaciones.

No es un duplicado de Git ni un registro de cada archivo modificado.

## 2026-11-04 — Auditoría inicial e implementación del Harness

- Auditoría completa del repositorio (estructura, arquitectura, dependencias, fuentes canónicas, sistemas externos, pruebas, seguridad).
- Implementación del Harness de ingeniería (`harness/AGENTS.md`, `harness/docs/`, `harness/tasks/`, `harness/progress/`, `harness/checks/`).
- Decisiones confirmadas registradas en `harness/progress/decisiones.md` (D-001 a D-014).
- Definición de Done establecida en `harness/checks/reglas-de-salida.md`.

## 2026-11-04 — T-002 FAB compartido

- Creado `shared/components/fab-button/` (componente standalone con `icon`, `open`, `disabled`, `label`, `haspopup`, `mobile`, output `click`, `nativeElement`/`focus()` para devolver foco al opener).
- Reemplazados `#newListFab` y `#newNoteFab` en `board.page.html` por `app-fab-button`; el de notas gira como el de listas mediante getter `notesEditorOpen` que lee `notesWorkspace.editorOpen`.
- Eliminado CSS duplicado del FAB de `board.page.scss`; el componente usa tokens `--z-content-fab`, safe areas, `--fab-color`/`--fab-hover`.
- Versión subida a build `1.64.6-a` (`npm run version:bump -- --build`).
- Validación: spec `fab-button` 6/6; `npm test` 634/635 (1 fallo pre-existing en notes-workspace, no relacionado); `tsc --noEmit` limpio en archivos tocados; `npm run build` limpio.
- Playwright escritorio: FAB de notas gira y restaura foco al cerrar verificado. FAB de listas pendiente de confirmar `toggleAddList` en navegador real.
- Archivos: `shared/components/fab-button/*` (nuevo), `board.page.html/scss/ts` (editados), `core/app-version.ts` (editado por script).

## 2026-11-04 — T-002 corrección de regresión (doble ejecución del clic)

- Regresión: `fab-button` declaraba `@Output() click` que colisionaba con el evento DOM nativo del `<button>` interno; `toggleAddList()` se ejecutaba dos veces (abría y cerraba Nueva lista al instante). El FAB de Notas parecía funcionar porque `createNote()` es idempotente.
- Corrección: renombrado output `click` → `activated`; `board.page.html` usa `(activated)` en ambos `<app-fab-button>`.
- Añadidos 2 specs de regresión: un clic → handler del consumidor exactamente una vez; dos clics → dos veces.
- Validación: spec `fab-button` 8/8; `npm test` 636/637 (1 fallo pre-existing en `notes-workspace.component.spec.ts:78`, demostrado previo a T-002); `tsc --noEmit` limpio; `npm run build` limpio.
- Playwright escritorio (1280px) y móvil (600px): AMBOS FABs verificados — Listas abre Nueva lista y devuelve foco al cerrar; Notas abre el editor, gira y devuelve foco al cerrar.
- Archivos: `fab-button.component.ts` (output renombrado), `board.page.html` (click → activated).

## 2026-11-05 — T-003 Botones y campos de formulario compartidos

- Creado `shared/components/action-button/` (variantes primary/secondary/danger, ícono opcional, `ion-ripple-effect`, output `click`, `nativeElement`/`focus()`), `shared/components/close-button/` (cabecera, 32×32) y `shared/components/text-field/` (etiqueta, foco, contador opcional, error, outputs valueChange/enter/paste).
- Integrado en Nueva lista (`board.page`): `<app-close-button>`, `<app-text-field [(value)]>` con contador, `<app-action-button variant="secondary">` (Cancelar) y `<app-action-button variant="primary" type="submit">` (Crear lista).
- Integrado en Nueva nota (`notes-workspace`): `<app-close-button>` (Cerrar), `<app-text-field>` (Título), `<app-action-button variant="danger">` (Eliminar), `<app-action-button variant="secondary">` (Cancelar), `<app-action-button variant="primary">` (Guardar nota). Añadido `ion-ripple-effect` a botones de barra de formato y adjuntos.
- Eliminado CSS duplicado de botones/campo de `board.page.scss` y `notes-workspace.component.scss`.
- Añadidos tokens de botón en `styles.css` (valores basados en hex existentes; sin hex nuevos).
- Versión subida a build `1.64.9-a` (`npm run version:bump -- --build`).
- Validación: specs action-button 8/8, close-button 8/8, text-field 10/10; `npm test` 662/663 (1 fallo pre-existing en notes-workspace, no relacionado); `tsc --noEmit` limpio; `npm run build` limpio.
- Playwright escritorio (1280px), móvil (600px) y segundo tema (Celeste): Nueva lista y Nueva nota crean, guardan y devuelven el foco al FAB.
- Archivos: `shared/components/action-button/*`, `shared/components/close-button/*`, `shared/components/text-field/*` (nuevos); `styles.css`, `board.page.html/scss/ts`, `notes-workspace.component.html/scss/ts` (editados); `core/app-version.ts` (editado por script).

---

---

**Formato para nuevas entradas**:

```
### YYYY-MM-DD — [Título]

- Descripción breve del avance, problema o corrección.
- Archivos o módulos afectados (rutas).
- Validación realizada (tests, build, navegador).
- Decisiones tomadas (referencia a `decisiones.md` si aplica).
```
