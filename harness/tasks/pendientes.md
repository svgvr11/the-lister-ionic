# Backlog de tareas pendientes

Este archivo funciona como backlog. Cada elemento tiene identificador, descripción, contexto, dependencias en cadena, criterios de finalización y estado.

No inventar prioridades ni compromisos que el usuario no haya aprobado.

---

## T-001 — Investigación y plan, sin cambios de código

**Descripción:** Confirmar la auditoría (hallazgos H1-H9) contra el código y el navegador, y proponer un plan de implementación que el usuario apruebe antes de tocar código.

**Contexto:** Base `docs/claude/01-auditoria-ui-fab-y-modales.md` (snapshot v1.64.5-a, 2026-11-04). El FAB de Notas no gira y queda sobre el modal; el modal de Nueva nota es otra implementación del bottom sheet. Causa del FAB sobre el modal: `<app-notes-workspace>` vive dentro de `<ion-content>` y su `position: fixed; z-index: 1200` queda atrapado en el contexto de apilamiento del scroller de Ionic.

**Dependencias:** Ninguna (tarea inicial de la serie).

**Criterios de finalización:**
- Confirmación o corrección de cada hallazgo H1-H9 con evidencia (archivo/línea; para H3 y H5 comprobación en navegador; para Atrás de Android, qué se pudo y qué no).
- Descripción exacta de lo que hace hoy el FAB de lista (ícono, giro, estado abierto) en escritorio y móvil, como comportamiento de referencia.
- Propuesta de arquitectura: (a) dónde se renderizan FAB y sheet respecto de `<ion-content>` (evalúa portal a `document.body` con CDK Overlay/Portal y renderizado en el host de la page), (b) API del componente FAB, del sheet y de los botones, (c) registro de overlays en `OverlayStackService`, (d) fuente única del modo móvil, (e) cómo se monta `pages/notes` bajo el toggle y su contrato, (f) división de `notes-workspace` en componentes compartidos (tarjeta de nota, editor de nota).
- Recomendación por cada decisión con alternativas y riesgos; lista de decisiones que necesitan aprobación del usuario.
- Orden y tamaño estimado de las tareas 2-6 (puede proponer dividir una).

**Estado:** terminado

---

## T-002 — FAB compartido (`shared/components/fab-button/`)

**Descripción:** Un único componente de FAB usado por Checklists y Notas, mismo aspecto, animación de giro, estados y accesibilidad.

**Contexto:** Extraer markup y estilos del FAB (`.fab-add-list`, `.open`, hover, active, disabled, variante móvil 54px, reduced-motion) de `board.page.html/.scss` al componente. Reemplazar `#newListFab` y `#newNoteFab` en `board.page.html` por el componente. Mantener `#newListFab` accesible como opener para devolver el foco.

**Dependencias:** T-001 (plan aprobado).

**Criterios de finalización:**
- En Checklists el FAB se ve y se comporta exactamente como antes (captura antes/después).
- En Notas el FAB es idéntico en aspecto y animación al de Checklists.
- No queda CSS de FAB duplicado en `board.page.scss` ni en `notes-workspace`.
- Spec del componente: render por inputs, estado abierto, disabled, emite clic, aria; foco devuelto al opener al cerrar el modal.

**Estado:** terminado

---

## T-003 — Botones y campos de formulario compartidos

**Descripción:** Cancelar / confirmar / peligro / cerrar y campos de texto iguales en Nueva lista y Nueva nota (hallazgos H6 y H7).

**Contexto:** Componentes en `shared/components/`: botón de acción (primario, secundario, peligro, ícono opcional, `ion-ripple-effect`), botón de cerrar de cabecera, campo de texto con etiqueta, foco, contador de caracteres opcional y estado de error. Sustituir clases `.new-list-cancel/.new-list-submit/.new-list-close` y el campo en Nueva lista; `.note-cancel-button/.note-save-button/.note-delete-button/.note-editor-close` y `<input>` de título en edición de nota.

**Dependencias:** T-001 (plan aprobado).

**Criterios de finalización:**
- Nueva lista se ve y funciona igual que antes.
- Botones y campo de Nueva nota visualmente idénticos a los de Nueva lista.
- No quedan familias de clases duplicadas en esos dos flujos.
- Specs de los componentes; accesibilidad (labels, `aria-pressed`/`disabled`, foco visible).

**Estado:** terminado

---

## T-004a — Sheet/modal compartido: componente + specs (corrige que el FAB tape el modal)

**Descripción:** Crear `shared/components/sheet-dialog/` (diálogo centrado en escritorio, bottom sheet en móvil) con CDK Portal a `document.body`, backdrop con `--overlay-backdrop-color` y blur, asa superior en móvil, animación de entrada (con reduced-motion), `role="dialog"` + `aria-modal` + `aria-labelledby`, trampa de Tab, foco inicial tras la animación, devolución de foco al opener, cierre por backdrop solo si `dismissible`, Escape. Auto-registro en `OverlayStackService` (`dismissible = !editorBusy`). Slots: cabecera, cuerpo, acciones. Fuente única del modo móvil (snapshot al abrir, como `newListMobilePresentation`). Tokens de `styles.css`; crear los que falten con comentario.

**Implementado:** componente y specs completos, sin migrar aún Nueva lista ni Nueva nota. Incluye `MobilePresentationService`, helper de tema, `setDismissible` en la pila y estilos globales del overlay. Ver detalle en `harness/tasks/actual.md`.

**Contexto:** Resuelve H3, H4, H5. `board.page` ya registra `board:new-list` en `syncOverlayStack()`; al asumir el sheet, retirar ese id del sync de board.

**Dependencias:** T-001 (plan aprobado C1-C5, C7-C8), T-002 (FAB), T-003 (botones/campos).

**Criterios de finalización:**
- Componente `sheet-dialog` standalone con specs: apertura/cierre, Escape, backdrop, registro/desregistro en overlay-stack, foco, trampa de Tab, modo móvil, `dismissible = !editorBusy`.
- No queda CSS de sheet duplicado.

**Estado:** terminado

---

## T-004b — Sheet/modal compartido: migrar Nueva lista y Nueva nota

**Descripción:** Migrar Nueva lista al `sheet-dialog` (comportamiento idéntico al actual; capturas antes/después) y luego Nueva nota (mismo backdrop, asa, animación, botones y foco que Nueva lista; el FAB queda debajo del modal). Atrás de Android/Escape lo cierran vía overlay-stack (si no se puede probar Android, declarado pendiente de verificar en dispositivo). Cerrar con cambios sin guardar en nota mantiene el comportamiento actual. Specs existentes de notes-workspace actualizadas, no borradas.

**Dependencias:** T-004a.

**Criterios de finalización:**
- Nueva lista: sin diferencias visibles ni de foco/teclado respecto de antes.
- Nueva nota: idéntica a Nueva lista; FAB debajo del modal.
- Specs existentes de notes-workspace actualizadas, no borradas.

**Estado:** terminado (fase 1 y fase 2 completadas y verificadas con Playwright en escritorio y móvil; capturas antes/después fuera del repo).

---

## T-005 — Capas (z-index) y tokens

**Descripción:** Eliminar z-index literales con significado de capa y usar solo los tokens de `styles.css` (H8), sin cambiar cómo se apila nada.

**Contexto:** Auditar y reemplazar literales en `board.page.scss`, `trash.page.scss`, `archive.page.scss`, `legal-page`, `notes` y componentes compartidos. Los z-index de orden interno de un componente (0/1/2/5) pueden quedarse; los que compiten con overlays o FAB se pasan a token. Documentar el mapa final de capas en el comentario de `styles.css`.

**Dependencias:** T-004 (sheet/modal compartido define las capas reales).

**Criterios de finalización:**
- Sin diferencias visuales ni de apilamiento (FAB, perfil, feedback, foco, nueva lista, nueva nota, eliminar, bloqueo de sesión, vista tarjetas con arrastre).
- No queda ningún literal ≥100 sin token. Si un literal no tiene equivalente claro, se pregunta al usuario.

**Estado:** pendiente

---

## Nota de arquitectura (no es una tarea de código)

`board.page` es el shell de facto de la app (hospeda Checklists y Notas, header común, FABs, overlays). Debe extraerse cuando llegue el estado Todo (`#/all`, hash routing), donde el switch alterna entre las pages `board` y `notes`. **Planificado, no implementado en esta serie.** No se toca ahora.

## T-006 — Mover Notas a `pages/notes/`

**Descripción:** `notes-workspace` deja `shared/components/` y pasa a ser la page `pages/notes/notes.page.*`, igual que `pages/board`, sin ruta propia: se sigue mostrando desde el toggle Checklists/Notas con el estado de `localStorage` (`core/board/board-content-view` no cambia). Resuelve H1.

**Contexto:** Crear `pages/notes/notes.page.ts/.html/.scss/.spec.ts` y mover la lógica y el spec existentes. Siguiendo "las pages solo componen", extraer lo reutilizable a `shared/components/` (tarjeta de nota y contenido del editor de nota) y dejar la page componiendo. Actualizar `board.page` para montarla según el contrato aprobado en T-001; actualizar imports, specs y `harness/docs/architecture.md`. La page no debe renderizar overlays ni FAB dentro de `<ion-content>`. Mantener intactos: pin de nota, masonry y modo flujo, búsqueda, adjuntos, vista tarjetas compacta, persistencia (`updateNotes`, `updatePinnedNoteId`).

**Dependencias:** T-001 (plan aprobado), T-002 (FAB), T-004 (sheet/modal), T-005 (capas/tokens).

**Criterios de finalización:**
- No queda nada de notas en `shared/components/notes-workspace/`.
- La vista Notas funciona igual que antes (crear, editar, borrar, fijar, adjuntar, buscar, tarjetas compactas, escritorio y móvil, dos temas).
- La preferencia de vista sobrevive a recargar.
- `npm test`, `tsc`, `build` limpios.
- Documentado en `decisiones.md` el plan de producto: switch futuro Todo/Checklists/Notas, `Todo` en `#/all`, el switch alterna entre las pages `board` y `notes` (planificado, no implementado).

**Estado:** terminado

---

## T-007 — Modal de foco y visor de nota sobre sheet-dialog

**Descripción:** Extraer el modo vista/edición de la nota y el modal de foco como componentes propios basados en `app-sheet-dialog`. No forman parte del alcance de T-006 (que solo mueve Notas a `pages/notes` y deja el editor dentro de la page).

**Contexto:** Se mantiene como tarea independiente. Se implementa después de T-006.

**Dependencias:** T-006 (pages/notes/), T-004a (sheet-dialog compartido).

**Estado:** pendiente

---

## T-008 — Reordenar notas manualmente con agarradera

**Descripción:** Añadir reordenamiento por arrastre a las notas con una agarradera (asa) solamente, sin contador, igual que en las listas. Nota: hoy las notas no tienen reordenamiento por arrastre (solo fijadas y fecha); es una funcionalidad nueva que cambia el modelo de datos (campo `position` de las notas).

**Contexto:** Pendiente de una decisión de producto del usuario. No implementar hasta que se apruebe. Se deja para el final, después de la rejilla masonry compartida y la vista Todo.

**Dependencias:** T-006 (pages/notes/), T-009 (shell app-home), rejilla masonry y tarjeta base compartidas.

**Criterios de finalización:** pendientes de definición por producto.

**Estado:** pendiente

---

## T-009 — Plan (investigación, sin código) para shell app-home

**Descripción:** Plan de investigación (sin implementar código) para extraer un shell `app-home` con `app-header`, buscador, switch Checklists/Notas y `app-footer`, con un outlet interno que alterne `app-checklists` y `app-notes`, a la manera del esquema `claude/04-arquitectura-objetivo-shell.md` del Project.

**Cubre:**
- Estado de `board.page` migrado a servicios.
- Rutas hijas (`#/all`, `#/checklists`, `#/notes`, con `#/board` redirigiendo).
- `router-outlet` plano frente a `ion-router-outlet`.
- Scroll único.
- Auth y deep links.

**Contexto:** Esta decisión sustituye a "Notas como estado en localStorage, sin ruta propia". El switch ya no alterna entre vistas dentro de `board.page`, sino entre páginas bajo el shell `app-home`.

**Dependencias:** T-006 (pages/notes/).

**Estado:** pendiente

---

## T-010 y siguientes — Ejecución por fases del shell

**Descripción:** Implementar el shell `app-home` por fases, según el plan aprobado en T-009.

**Estado:** pendiente

---

## Rejilla masonry y tarjeta base compartidas

**Descripción:** Extraer la rejilla masonry y la tarjeta base como componentes compartidos antes de la vista Todo. Antes se llamaba T-009 en el plan original; ahora se ejecuta después del shell.

**Estado:** pendiente

---

## Vista Todo (#/all)

**Descripción:** Vista Todo bajo el shell `app-home`.

**Estado:** pendiente

---

### Notas post-T-002 (pendientes de cierre, no bloquean T-003)

**Descripción:** Añadir reordenamiento por arrastre a las notas con una agarradera (asa) solamente, sin contador, igual que en las listas. Nota: hoy las notas no tienen reordenamiento por arrastre (solo fijadas y fecha); es una funcionalidad nueva que cambia el modelo de datos (campo `position` de las notas).

**Contexto:** Pendiente de una decisión de producto del usuario. No implementar hasta que se apruebe.

**Dependencias:** T-006 (pages/notes/).

**Criterios de finalización:** pendientes de definición por producto.

**Estado:** pendiente

---

### Notas post-T-002 (pendientes de cierre, no bloquean T-003)

1. **Spec roto `notes-workspace.component.spec.ts:78`:** el test "guarda una nueva nota con el texto enriquecido y emite los datos" falla con `TypeError: Cannot read properties of null (reading 'click')` porque busca `.new-note-button` que no existe en el DOM. Es **pre-existente a T-002** (sus archivos `.ts`/`.spec.ts` no fueron tocados; `git diff --stat` vacío). Se arregla o reescribe en **T-006** (al mover notas a `pages/notes`, el spec se traslada y reescribe junto al componente).

2. **Uso completo de `editorOpen` (condición C3 de T-001):** `board.page.ts` ya tiene el getter `notesEditorOpen` que lee `notesWorkspace.editorOpen` y hace girar el FAB de notas, pero `boardModalOpen`, `setContentView`, los guards y `[open]` del FAB aún no lo consumen plenamente. Eso se completa en **T-004/T-006** (sheet/modal compartido y page `pages/notes`).

3. **Foco inicial de Nueva lista roto desde T-003:** corregido en **T-004b fase 1**. `board.page.ts` ya no usa el `@ViewChild('newListTitleInput', { read: IonInput })` huérfano; usa `@ViewChild('newListTitleField') TextFieldComponent` con `focusInput()`, y el foco inicial cae en el campo de título (verificado con Playwright en escritorio y móvil).
