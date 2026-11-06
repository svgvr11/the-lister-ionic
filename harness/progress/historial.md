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

## 2026-11-05 — T-004a Sheet/modal compartido (componente + specs)

- Creado `shared/components/sheet-dialog/`: portal CDK a `document.body`, backdrop con tokens, diálogo centrado en escritorio y bottom sheet con asa en móvil, animación con reduced-motion, `role="dialog"`/`aria-modal`/`aria-labelledby`, slots de título/acciones/divisor/cuerpo/pie, cierre por botón/Escape/backdrop solo si `dismissible`, foco inicial y trampa de Tab, devolución de foco al opener y auto-registro en `OverlayStackService`.
- Fuente única del modo móvil: `core/ui/mobile-presentation` + `MobilePresentationService` (valor vivo para refresher/masonry, `snapshot()` para overlays). `board.page` dejó su `matchMedia` local y estrena getter/effect.
- `core/ui/overlay-stack` y `overlay-stack.service` admiten `setDismissible(id, dismissible)` sin reordenar; Nuevo helper `core/ui/theme-variables` reconstruye las variables del tema en la raíz portada.
- `styles.css`: contenedor CDK en `--z-page-overlay` y backdrop con blur; sin `angular.json` ni `overlay-prebuilt.css`.
- Versión subida a build `1.64.10-a` (`npm run version:bump -- --build`).
- Validación: sheet-dialog 18/18, mobile-presentation 4/4, mobile-presentation.service 2/2, theme-variables 3/3, overlay-stack 6/6; `npm test` 691/692 (único fallo preexistente en notes-workspace); `tsc --noEmit -p tsconfig.app.json` limpio; `npm run build` limpio (solo warnings CSS preexistentes).
- Playwright temporal: escritorio 680 px centrado sobre FAB/backdrop, foco y Tab/Escape correctos, snapshot móvil al redimensionar; móvil 390 px bottom sheet pegado abajo con asa; dos temas cambian acento/fondo. Página temporal retirada.
- Archivos: `shared/components/sheet-dialog/*`, `core/ui/mobile-presentation/*`, `services/mobile-presentation.service.*`, `core/ui/theme-variables/*` (nuevos); `overlay-stack.*`, `board.page.ts`, `styles.css` (editados); `core/app-version.ts` (script).

## 2026-11-05 — T-004b fase 1 — Nueva lista al sheet-dialog

- Migrada Nueva lista de `board.page` a `app-sheet-dialog` (`size="sm"`, `restoreFocus="false"`, `backdropDismissible="!newListTitle.trim()"`, foco en el campo de título, botones con texto proyectado). Se retira `board:new-list` de `syncOverlayStack()` (el sheet se auto-registra) y el `@ViewChild('newListTitleInput', { read: IonInput })` huérfano que causaba la regresión de foco de T-003 (foco quedaba en el FAB).
- `sheet-dialog` gana el input `backdropDismissible`; `action-button` deja de quitar el fondo al botón deshabilitado tras un toque en móvil; `styles.css` gana una regla global para que el `h2` proyectado herede 20 px / 700.
- Versión subida a build `1.64.11-a` (`npm run version:bump -- --build`).
- Validación: sheet-dialog 18/18; `npm test` 692/693 (único fallo preexistente en notes-workspace); `tsc --noEmit -p tsconfig.app.json` limpio; `npm run build` limpio (solo warnings CSS preexistentes).
- Playwright en `/#/board` (mock, 1280×900 y 390×844, dos temas): foco inicial en título, Tab/Shift+Tab atrapados, backdrop con texto no cierra, Escape/backdrop vacío cierran y devuelven foco al FAB, creación de lista verificada, botones "Cancelar"/"Crear lista" visibles, móvil con asa pegada abajo. Capturas antes/después guardadas fuera del repo.
- Fase 2 (Nueva nota) pendiente confirmación del usuario.
- Archivos: `sheet-dialog/*` (editado), `action-button.component.scss` (editado), `board.page.html/scss/ts` (editados), `styles.css` (editado), `core/app-version.ts` (script).

## 2026-11-05 — T-004b fase 2 — Nueva nota al sheet-dialog

- Migrada Nueva nota de `notes-workspace` a `app-sheet-dialog` (`size="md"`, `dismissible="!editorBusy"` [D-A], `backdropDismissible="!hasUnsavedChanges"` para proteger cambios sin guardar, `restoreFocus="false"`, foco en el campo de título, captura del modo móvil al abrir).
- `board.page` pasa `[theme]="activeTheme"` a notes-workspace y cancela el editor al salir de la página; `notes-workspace` gana `@Input() theme` y `editorOpener` `protected`.
- Retirado CSS duplicado del editor (`.note-editor-backdrop`, `.note-editor`, media query móvil) y el media query móvil de `notes-workspace.component.scss`.
- Versión subida a build `1.64.12-a` (`npm run version:bump -- --build`).
- Validación: notes-workspace 8/8; `npm test` 696/696; `tsc --noEmit -p tsconfig.app.json` limpio; `npm run build` limpio (solo warnings CSS preexistentes).
- Playwright en `/#/board` (mock, 1280×900 y 390×844, dos temas): título 20 px/700, foco inicial en título, Tab/Shift+Tab atrapados, backdrop con título escrito no cierra, Escape/backdrop vacío cierran y devuelven foco al FAB de notas, creación de nota verificada, botones Cancelar/Guardar nota (Guardar deshabilitado sin título, sin Eliminar en nota nueva), móvil con asa pegada abajo, modo móvil se decide al abrir y no cambia al redimensionar con sheet abierto. Capturas antes/después fuera del repo.
- Archivos: `notes-workspace.component.ts/html/scss` (editados), `board.page.html/ts` (editados), `styles.css` (editado), `core/app-version.ts` (script).

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

## 2026-11-05 — T-006 Mover Notas a pages/notes/ y corregir hasUnsavedChanges

- `notes-workspace` eliminado; Notas vive en `pages/notes/notes.page.*` con componentes `shared/components/note-card/` y `shared/components/note-editor-content/`. `board.page` usa `<app-notes-page>` y consume `editorOpenChange` (C4 T-001).
- `hasUnsavedChanges` compara contra snapshot del estado original (`originalNote`) al abrir una nota existente; para nota nueva se mantiene el criterio anterior. HTML normalizado a texto plano para comparar; quitar/añadir adjunto cuenta como cambio; volver al valor original, no.
- Añadidos 6 specs de regresión en `notes.page.spec.ts`: abrir+cerrar sin cambios (X y fondo) no pide confirmación; editar título o texto sí; volver al original no; quitar adjunto sí.
- `styles.css`: `--highlight-height: 0px` extendido a `ion-input`/`ion-textarea` sin clase de modo. El usuario corrigió además la barra verde bajo "Añadir tarea" sobreescribiendo `ion-valid.sc-ion-input-md-h` con `--highlight-color: none` en `shared/components/add-task-input/add-task-input.component.scss` (causa raíz: Ionic aplica `--highlight-height` por defecto en `ion-input:valid` con mayor especificidad que el selector de modo). Verificado que cubre "Añadir tarea"; `text-field` y Nueva lista usan `<input>` nativo (no `ion-input`) y no están afectados por el highlight de Ionic.
- `notes.page.scss`: rejilla de Notas alineada con listas — columnas `repeat(2, minmax(0, 1fr))` con media queries 600px (3 col) y 900px (4 col), `gap: 14px`, idéntico a `.board.board-cards`. Contenedor dentro de `.board-scroller` (padding lateral 6px desktop / 8px móvil), igual que Checklists.
- `note-card.component.*`: sin hueco vacío arriba (eliminado `note-card-handle-slot`; no se reserva espacio para T-008 todavía), pin + título en misma fila en desktop (media query ≥701px), título 15px/650 como listas, padding 12px 14px 14px, borde `#edf0f6`/`--card-surface`, `width: 100%` en grid y `min(100%, 520px)` centrado en modo flow.
- Quitado `<h2>Notas` redundante de `notes.page.html` (registrado aquí; ningún spec depende de él).
- Versión: Build `1.64.16-a` (subida por el usuario al iniciar T-006; no se vuelve a subir por los arreglos de este cierre).
- Validación: `npm test` 709/709 (52 archivos); `npm run build` limpio (solo warnings CSS preexistentes).
- Playwright verificado: escritorio 1280/1440/1680px y móvil 390px, dos temas — abrir nota guardada y cerrar sin cambios (X/fondo) cierra directo; con cambio aparece "Descartar cambios / Seguir editando"; Nueva lista sin barra verde; margen, ancho de columna y hueco de Notas coinciden con Checklists en todos los tamaños.
- Archivos: `pages/notes/*` (nuevo), `shared/components/note-card/*` (nuevo), `shared/components/note-editor-content/*` (nuevo), `shared/components/notes-workspace/` (eliminado), `board.page.html/ts` (editado), `styles.css` (editado), `add-task-input.component.scss` (editado por el usuario), `notes.page.spec.ts` (editado), `historial.md` (editado), `pendientes.md` (editado), `decisiones.md` (editado, D-020 sustituye a C9 de D-015).

---

## 2026-11-05 — T-004b fase 2 — Nueva nota al sheet-dialog

```
### YYYY-MM-DD — [Título]

- Descripción breve del avance, problema o corrección.
- Archivos o módulos afectados (rutas).
- Validación realizada (tests, build, navegador).
- Decisiones tomadas (referencia a `decisiones.md` si aplica).
```
