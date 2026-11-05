# Tarea activa

## T-002 — FAB compartido (`shared/components/fab-button/`)

**Estado:** terminado.

**Regresión corregida:** `fab-button` declaraba un `@Output() click` que colisionaba con el evento DOM nativo del `<button>` interno, provocando doble ejecución del handler del consumidor (`toggleAddList()` abría y cerraba Nueva lista al instante). Se renombró el output a `activated` y se actualizó `board.page.html` para usar `(activated)` en ambos FABs.

**Qué cambió:**
- Creado `src/app/shared/components/fab-button/` (`.component.ts/.html/.scss/.spec.ts`) con inputs `icon`, `open`, `disabled`, `label`, `haspopup`, `mobile`; output `activated` (renombrado de `click` para evitar doble ejecución); getter `nativeElement` y método `focus()` para devolver el foco al opener.
- Reemplazados `#newListFab`/`#newNoteFab` de `board.page.html` por `<app-fab-button>` con `(activated)`. El de listas usa `[open]="addingList"`, `[disabled]="isAtListLimit"`, `[icon]` dinámico, `[label]="listLimitLabel"`. El de notas usa `[open]="notesEditorOpen"` (getter que lee `notesWorkspace.editorOpen` para girar como el de listas).
- Eliminado CSS duplicado del FAB de `board.page.scss` (bloque desktop y sobreescritura móvil en `@media (max-width: 480px)`). El componente usa tokens `--z-content-fab`, safe areas, `--fab-color`/`--fab-hover` con fallback.
- `board.page.ts`: importó `FabButtonComponent`, lo añadió al `imports` del componente, cambió `@ViewChild('newListFab')` de `ElementRef<HTMLButtonElement>` a `FabButtonComponent`, añadió getter `notesEditorOpen`.

**Verificación:**
- `npm test`: spec `fab-button` 8/8 pasa (incluidos 2 specs de regresión: un clic → handler exactamente una vez; dos clics → dos veces). Suite completa 636/637 (1 fallo pre-existing en `notes-workspace.component.spec.ts:78`, demostrado previo a T-002: busca `.new-note-button` que no existe; sus archivos `.ts`/`.spec.ts` no fueron tocados, `git diff --stat` vacío).
- `npx tsc --noEmit`: sin errores en archivos de T-002.
- `npm run build`: completado sin errores; presupuesto de estilos respetado.
- Playwright escritorio (1280px):
  - Listas: FAB abre Nueva lista, gira (`.open`, ícono `close`), al cerrar vuelve a cerrado y devuelve el foco al FAB (`activeIsFab: true`).
  - Notas: FAB abre el editor, gira, al cerrar vuelve a cerrado y devuelve el foco al FAB.
- Playwright móvil (600px ≤ 700px):
  - Listas: FAB abre Nueva lista, gira, al cerrar devuelve el foco al FAB.
  - Notas: FAB abre el editor, gira, al cerrar devuelve el foco al FAB.

**Versión:** Build `1.64.6-a` (subida antes de editar; no se pidió de nuevo el tipo de subida por ser el mismo arreglo de T-002).

**Archivos afectados:**
- `src/app/shared/components/fab-button/fab-button.component.ts` (nuevo)
- `src/app/shared/components/fab-button/fab-button.component.html` (nuevo)
- `src/app/shared/components/fab-button/fab-button.component.scss` (nuevo)
- `src/app/shared/components/fab-button/fab-button.component.spec.ts` (nuevo)
- `src/app/pages/board/board.page.html` (editado: `(activated)` en ambos `<app-fab-button>`)
- `src/app/pages/board/board.page.scss` (editado: eliminado CSS duplicado del FAB)
- `src/app/pages/board/board.page.ts` (editado: import, imports, ViewChild, getter notesEditorOpen)
- `src/app/core/app-version.ts` (editado por script de versión: 1.64.5-a → 1.64.6-a)

**Pruebas no ejecutadas de T-002:** segundo tema de `BOARD_THEMES`, tabulación y `prefers-reduced-motion` en Playwright (pendiente si se desea completar antes de T-003).

## T-001 — Investigación y plan

**Estado:** terminado.
