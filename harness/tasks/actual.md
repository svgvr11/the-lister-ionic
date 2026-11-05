# Tarea activa

## T-003 — Botones y campos de formulario compartidos

**Estado:** terminado.

**Qué cambió:**
- Creado `src/app/shared/components/action-button/` (`.component.ts/.html/.scss/.spec.ts`): botón de acción con variantes `primary`/`secondary`/`danger`, ícono opcional, `ion-ripple-effect`, output `click` (renombrado para evitar doble ejecución con el evento nativo), `nativeElement`/`focus()`. Importa `CommonModule` (para `*ngIf` en el ícono).
- Creado `src/app/shared/components/close-button/` (`.component.ts/.html/.scss/.spec.ts`): botón de cerrar de cabecera (32×32, ícono close, ripple, `aria-label`), output `click`.
- Creado `src/app/shared/components/text-field/` (`.component.ts/.html/.scss/.spec.ts`): campo de texto con etiqueta, foco, contador de caracteres opcional, estado de error, usa `<input>` nativo internamente, outputs `valueChange`/`enter`/`paste`/`focus`/`blur`. Importa `CommonModule` (para `*ngIf`).
- Añadidos tokens en `src/styles.css`: `--btn-secondary-bg`, `--btn-secondary-bg-hover`, `--btn-secondary-text`, `--btn-danger-bg`, `--btn-danger-text` (valores basados en hex existentes; no se añadieron hex nuevos). `--btn-primary-text` se omitió para evitar warning de CSS (`var()` anidado); se usa fallback en el componente.
- Integrado en `board.page`: Nueva lista usa `<app-close-button>`, `<app-text-field>` (con `[(value)]`, `showCounter`, `(enter)`, `(paste)`), `<app-action-button variant="secondary">` (Cancelar) y `<app-action-button variant="primary" type="submit">` (Crear lista). Eliminado CSS duplicado de `.new-list-close`, `.new-list-field-label`, `.new-list-field`, `.new-list-input`, `.new-list-submit`, `.new-list-cancel` y sus focus-visible de `board.page.scss`. `board.page.ts` importó los 3 componentes y los añadió al `imports` del `@Component`.
- Integrado en `notes-workspace`: Nueva nota usa `<app-close-button>` (Cerrar), `<app-text-field>` (Título, `(valueChange)`), `<app-action-button variant="danger">` (Eliminar), `<app-action-button variant="secondary">` (Cancelar), `<app-action-button variant="primary">` (Guardar nota). Añadido `ion-ripple-effect` a botones de barra de formato y adjuntos. Eliminado CSS duplicado de `.note-editor-close`, `.note-title-label`, `.note-title-input`, `.note-cancel-button`, `.note-delete-button` de `notes-workspace.component.scss`. `notes-workspace.component.ts` importó los 3 componentes y los añadió al `imports` del `@Component`.

**Versión:** Build `1.64.9-a` (subida antes de editar).

**Verificación:**
- Specs: action-button 8/8, close-button 8/8, text-field 10/10.
- `npm test`: 662/663 (1 fallo pre-existing en `notes-workspace.component.spec.ts:78`, demostrado previo a T-002/03).
- `npx tsc --noEmit`: sin errores en archivos de T-003 (solo el pre-existing `beforeEach` en notes-workspace.spec.ts).
- `npm run build`: completado sin errores.
- Playwright escritorio (1280px): Nueva lista abre, rellena título, guarda, se crea la lista; Nueva nota abre editor, rellena título+contenido, guarda, editor cierra y foco vuelve al FAB.
- Playwright móvil (600px): Nueva lista y Nueva nota funcionan igual (crear y guardar).
- Playwright segundo tema (Celeste): Nueva lista se abre con el campo de texto; colores del tema aplicados.

**Archivos afectados:**
- `src/app/shared/components/action-button/*` (nuevo: 4 archivos)
- `src/app/shared/components/close-button/*` (nuevo: 4 archivos)
- `src/app/shared/components/text-field/*` (nuevo: 4 archivos)
- `src/styles.css` (editado: tokens de botón)
- `src/app/pages/board/board.page.html` (editado: componentes compartidos en Nueva lista)
- `src/app/pages/board/board.page.scss` (editado: eliminado CSS duplicado)
- `src/app/pages/board/board.page.ts` (editado: imports, imports del componente)
- `src/app/shared/components/notes-workspace/notes-workspace.component.html` (editado: componentes compartidos en Nueva nota)
- `src/app/shared/components/notes-workspace/notes-workspace.component.scss` (editado: eliminado CSS duplicado)
- `src/app/shared/components/notes-workspace/notes-workspace.component.ts` (editado: imports, imports del componente)
- `src/app/core/app-version.ts` (editado por script de versión: 1.64.8-a → 1.64.9-a)

**Pruebas no ejecutadas de T-003:** tabulación explícita en botones/campos de Nueva lista/Nueva nota (el foco visible está cubierto por specs y por la verificación del FAB en T-002; `prefers-reduced-motion` ya verificado para FAB en T-002, aplicable a botones/campos por CSS compartido).

## T-001 — Investigación y plan

**Estado:** terminado.
