# Tarea activa

## T-004a — Sheet/modal compartido: componente + specs

**Estado:** terminado.

**Qué cambió:**
- Creado `src/app/shared/components/sheet-dialog/` (`.component.ts/.html/.scss/.spec.ts`): componente standalone que porta su contenido a `document.body` con CDK Overlay (`TemplatePortal`), backdrop con tokens, panel centrado en escritorio y bottom sheet con asa en móvil, animación de entrada con reduced-motion, `role="dialog"`, `aria-modal` y `aria-labelledby`.
- API sin conocimiento de listas/notas: inputs `size` (`sm`/`md`), `dismissible`, `mobile`, `theme`, `opener`, `labelledBy`, `showCloseButton`, `closeLabel`, `initialFocusSelector`, `restoreFocus`; output `closed`; slots `[sheet-title]`, `[sheet-header-actions]`, `[sheet-divider]`, cuerpo por defecto y `[sheet-footer]`; reutiliza `app-close-button` de T-003.
- Foco: primer control del cuerpo tras la animación (o contenedor si no hay), trampa de Tab, Escape/backdrop solo si `dismissible`, devolución al opener al desmontar; registro automático en `OverlayStackService` con `dismissible` actualizable en vivo mediante `setDismissible(id, dismissible)`.
- Fuente única del modo móvil: helper puro `core/ui/mobile-presentation` (umbral 700) + `MobilePresentationService` (señal viva y `snapshot()` para overlays al abrir). `board.page` dejó de crear su `matchMedia` local; mantiene el valor vivo para refresher/masonry y usa instantáneas para menú de cuenta, modal de foco y Nueva lista.
- Mapa puro `core/ui/theme-variables` que reconstruye las variables del tema de board.page (`--accent`, `--board-bg`, `--topbar-bg`, `--fab-color`, `--fab-hover`, `--card-surface`, `--on-accent`, `--focus-muted-text`) para aplicarlas en la raíz portada.
- Añadidos a `src/styles.css` los estilos globales del contenedor CDK (`--z-page-overlay`) y del backdrop. CDK 20 ya inyecta los estilos base del overlay; no se tocó `angular.json`.
- Título del sheet: 20 px / 700. Decisión registrada en `decisiones.md` (D-017).

**Versión:** Build `1.64.10-a` (subida antes de editar).

**Verificación:**
- Specs: sheet-dialog 18/18; mobile-presentation 4/4; mobile-presentation.service 2/2; theme-variables 3/3; overlay-stack 6/6.
- `npx tsc --noEmit -p tsconfig.app.json`: sin errores.
- `npx tsc --noEmit` (raíz): falla solo por errores preexistentes (`beforeEach` sin importar en `notes-workspace.component.spec.ts:26` y tipos Deno/URLs de `supabase/functions/*`); no hay errores en archivos de T-004a.
- `npm run build`: completado sin errores (solo warnings CSS preexistentes de `--btn-*` fuera de `:root` en `styles.css:65`).
- `npm test`: 691/692; el único fallo es el preexistente `notes-workspace.component.spec.ts:78` (`.new-note-button` inexistente), ya documentado desde T-002 y no relacionado con T-004a.
- Playwright con página temporal (retirada después) en `http://localhost:4200/#/sheet-preview`:
  - Escritorio 1280×900: sheet de 680 px centrado, portado al contenedor CDK; `z-index` overlay 1000 y FAB 200; `elementFromPoint` sobre el FAB devuelve el backdrop del sheet; foco inicial en el input; Tab/Shift+Tab atrapados; Escape cierra y devuelve foco al opener; botón de cerrar cierra.
  - Redimensionar a 390 px con el sheet abierto conserva la variante de escritorio (snapshot al abrir).
  - Móvil 390×844: bottom sheet de 390 px pegado al borde inferior, asa visible y foco inicial correcto.
  - Dos temas de `BOARD_THEMES`: el acento y `--board-bg` cambian en caliente bajo el portal.
- Playwright de regresión en `/#/board` (modo mock):
  - Escritorio: Nueva lista abre sin variante móvil; al redimensionar a 390 px conserva la variante (snapshot); cerrar devuelve el foco al FAB.
  - Móvil tras recargar: Nueva lista abre con `mobile-sheet`; menú de cuenta abre como modal con scrim y `role="dialog"`; al volver a escritorio conserva la variante móvil.
  - Detectado un fallo **preexistente de T-003**: el foco inicial de Nueva lista queda en el FAB porque `board.page.ts:619` sigue leyendo `@ViewChild('newListTitleInput', { read: IonInput })`, pero T-003 reemplazó el `ion-input` por `app-text-field` sin ese template ref. No se corrige en T-004a (fuera de alcance); queda anotado en `pendientes.md` para T-004b.
- Capturas: escritorio tema 1, escritorio tema 2 y móvil (archivos temporales fuera del repo).

**Archivos afectados:**
- `src/app/shared/components/sheet-dialog/*` (nuevo: 4 archivos)
- `src/app/core/ui/mobile-presentation/*` (nuevo: 2 archivos)
- `src/app/services/mobile-presentation.service.ts` + `.spec.ts` (nuevo)
- `src/app/core/ui/theme-variables/*` (nuevo: 2 archivos)
- `src/app/core/ui/overlay-stack/overlay-stack.ts` (editado: `setDismissible`)
- `src/app/services/overlay-stack.service.ts` + `overlay-stack.spec.ts` (editados)
- `src/app/pages/board/board.page.ts` (editado: servicio móvil, snapshots y `effect()` de masonry)
- `src/styles.css` (editado: contenedor CDK, backdrop y capa)
- `src/app/core/app-version.ts` (editado por script: 1.64.9-a → 1.64.10-a)

**Pendiente / fuera de alcance:**
- T-004b: migrar Nueva lista y Nueva nota al sheet, comparar antes/después y retirar su CSS duplicado. En T-004a los flujos existentes siguen con sus overlays actuales.
- Atrás de Android en el nuevo sheet: no verificado en dispositivo; queda para T-004b.

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
