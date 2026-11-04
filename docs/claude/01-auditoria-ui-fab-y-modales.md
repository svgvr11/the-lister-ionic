# Auditoría UI: FAB, modales y vista Notas (v1.64.5-a, 2026-11-04)
 
Solo lectura: no se modificó código. Referencias a archivos de `src/app/`.
 
## 1. Resumen
 
La vista Notas se construyó **copiando** patrones de `board.page` en lugar de **reutilizarlos**. Hay tres elementos que deberían ser uno solo (FAB, hoja/modal de creación, botones de acción) y una pieza mal ubicada (`notes-workspace`).
 
## 2. Hallazgos
 
### H1. `notes-workspace` está en `shared/components/` pero es una page (severidad: arquitectura)
- Tiene estado propio (editor, borrador, adjuntos, masonry, pin), servicio inyectado (`NoteAttachmentService`) y decide navegación de contenido. Eso no es un componente compartido, es una vista.
- `AGENTS` define `shared/components/` para piezas reutilizables y `pages/` para vistas. Hoy `pages/` tiene: board, login, trash, archive, privacy, terms.
- La vista activa (Checklists/Notas) no es ruta: `contentView` se guarda en `localStorage` (`core/board/board-content-view`) y `board.page.html` hace `*ngIf="contentView === 'notes'"` (líneas ~337, 725, 757, 775). `app.routes.ts` no tiene ruta de notas.
- Consecuencia: `board.page` (1.279 líneas de HTML, 3.403 de SCSS, 2.869 de TS) hospeda las dos vistas y el header común, y es el cuello de botella de todo.
### H2. Dos FABs copiados en vez de un componente (severidad: alta)
- `board.page.html` ~754-779 define **dos `<button class="fab-add-list">`** casi iguales: `#newListFab` y `#newNoteFab`.
- El de lista tiene `[class.open]="addingList"`, `[disabled]="isAtListLimit"`, icono dinámico (`close`/`add`), `aria-expanded`, tooltip con el límite de listas. El de nota no tiene `open`, ni `aria-expanded`, ni disabled.
- La animación de giro está en `board.page.scss` ~1858: `.fab-add-list.open ion-icon { transform: rotate(45deg) }`. Como el FAB de nota nunca recibe `.open`, **no gira**. Ese es el síntoma que describes.
- Nombre de clase `fab-add-list` ya engañoso (sirve para notas). Estilos solo en `board.page.scss` (líneas 1811-1862 y 3038), así que ninguna otra page puede usarlo sin copiar.
- Usa `--fab-color` / `--fab-hover` definidos en board; `notes-workspace` recibe `themeAccent` por `@Input` y duplica el acento como `--accent`.
### H3. El FAB queda por encima del modal de Nueva nota: causa raíz (severidad: alta)
- `<app-notes-workspace>` se renderiza **dentro de `<ion-content>`** (board.page.html ~725). Su `.note-editor-backdrop` es `position: fixed; z-index: 1200` (notes-workspace.component.scss ~255).
- El propio `board.page.html` documenta (comentario sobre "Overlays fixed a nivel de página") que el scroller interno de `ion-content` (`.inner-scroll`, `will-change: scroll-position`) crea un contexto de apilamiento y un containing block en WebKit. El `z-index: 1200` queda **atrapado** dentro de `ion-content`.
- El FAB está **fuera** de `ion-content`, a nivel de página, con `z-index: var(--z-content-fab)` = 200. Fuera del contexto atrapado, 200 > "lo que sea que valga el modal dentro de ion-content" → el FAB tapa el botón **Guardar nota**.
- El modal de Nueva lista no tiene el problema porque su overlay está fuera de `ion-content` (board.page.html ~782) y usa `--z-page-overlay` (1000).
- Corrección correcta: el modal de nota debe renderizarse a nivel de page (fuera de `ion-content`) con los tokens de z-index de `styles.css`; no basta con subir el número.
### H4. Dos implementaciones distintas del bottom sheet (severidad: alta)
| Aspecto | Nueva lista (board.page) | Nueva nota (notes-workspace) |
|---|---|---|
| Backdrop | `.modal-backdrop`: `var(--overlay-backdrop-color)` + blur | `rgba(15,23,42,.42)` fijo, **sin blur** |
| z-index | token `--z-page-overlay` | `1200` literal |
| Modo móvil | `isMobilePresentation` (matchMedia 700px en TS) + clase `.mobile-sheet` | `@media (max-width: 700px)` en SCSS |
| Asa superior (`::before`) | Sí | No |
| Animación de entrada | `newListSheetEnter` 0.18s | Ninguna |
| Cabecera/cierre | `.new-list-header` / `.new-list-close` | `.note-editor-header` / `.note-editor-close` |
| Foco | Atrapa Tab (`keepFocusInsideDialog`), foco inicial tras animación, devuelve foco al opener | Solo devuelve foco al opener; sin trampa de Tab |
| Tokens de color | `var(--card-surface)`, `--accent`, etc. | Hex literales (`#26334a`, `#fff`, `#f3f5f9`…) |
| Superficie | `.overlay-card` (definida en board.page.scss) | usa la clase `overlay-card` pero con estilos de componente encapsulados; la regla de board **no aplica** |
 
### H5. El modal de nota no está en el `OverlayStackService` (severidad: media-alta)
- `board.page.ts` registra sus overlays (`board:new-list`, `board:focus-list`, `board:feedback`…) en `syncOverlayStack()`. `notes-workspace` no registra nada.
- Efecto probable: botón/gesto **Atrás en Android** no cierra el modal de nota (sale de la pantalla o ignora), Escape solo funciona si el foco está dentro (`(keydown.escape)` en la sección), y otros overlays no saben que hay uno abierto (`hasOverlay` en board.page.ts ~1525 no lo ve). **Por verificar en dispositivo.**
### H6. Botones de acción duplicados (severidad: media)
- Nueva lista: `.new-list-cancel`, `.new-list-submit`, `.new-list-close`. Nota: `.note-cancel-button`, `.note-save-button`, `.note-delete-button`, `.note-editor-close`. Trash usa `.trash-dialog-cancel/confirm`; delete-list tiene `.delete-list-actions`. Mismo rol, cinco familias de clases, estilos repetidos (radio, padding, hover, disabled, ripple).
- El botón primario de lista lleva `ion-icon add` + ripple; el de nota ("Guardar nota") ni ícono ni `ion-ripple-effect`.
- Los botones del editor de nota (toolbar, adjuntar, cerrar) tampoco llevan `ion-ripple-effect`, a diferencia del resto de la app.
### H7. Estilos y controles de formulario inconsistentes (severidad: media)
- Nueva lista usa `<ion-input>` dentro de `.new-list-field` (con `:focus-within`, borde de acento, contador de caracteres a los 70). Nueva nota usa `<input>` nativo con estilo propio: foco y borde distintos.
- Etiquetas: lista usa `.new-list-field-label` centrada; nota usa `.note-title-label` alineada a la izquierda, 12px.
- Tipografía y colores literales en notes-workspace (386 líneas de SCSS) en lugar de variables del tema de la page.
### H8. Capas (z-index) sin sistema único (severidad: media)
- `styles.css` define tokens (`--z-content-fab`, `--z-page-overlay`, `--z-stacked-confirmation`, `--z-feedback-overlay`, `--z-session-lock`). Pero hay valores literales sueltos: `1200` en notes-workspace (choca con el valor de `--z-feedback-overlay`, mismo número con otro significado), `300`, `250`, `100`, `5`, `3`, `2` en board/trash/archive/legal.
- `trash.page.scss` y `archive.page.scss` repiten bloques `z-index: 300/250/100/5` que parecen copias de board.
### H9. Los diálogos no son un componente (severidad: media, deuda previa)
- Nueva lista, eliminar lista, modo foco, cuenta, feedback, bienvenida, confirmaciones de trash y archive: cada uno con su markup/backdrop/estilos. `welcome-modal` y `feedback-modal` sí son componentes, pero con su propio backdrop y z-index.
- `delete-list-overlay/delete-list-dialog` se "reutiliza" desde board para otras cosas por clase CSS (comentario en board.page.scss ~2826), pero trash/archive tienen la suya (`trash-dialog-*`).
## 3. Lo que NO es un problema (verificado)
- La lógica pura de notas ya está bien separada en `core/board/note-rules` y `note-attachment-rules` con specs.
- El estado Checklists/Notas está correctamente aislado en `core/board/board-content-view` (puro, con spec). Migrarlo a ruta solo cambia quién lo lee/escribe.
## 4. Propuesta de orden de trabajo (resumen)
1. **FAB compartido** (`shared/components/fab-button`): un solo componente con `open`, `disabled`, `icon`, `ariaLabel`, `expanded`; estilos movidos fuera de `board.page.scss`. Corrige H2.
2. **Sheet/modal compartido** (`shared/components/sheet-dialog` o similar): backdrop, asa, animación, trampa de foco, registro en `OverlayStackService`, modo móvil único, slots para cabecera/cuerpo/acciones. Nueva lista y Nueva nota pasan a usarlo. Corrige H3, H4, H5, H7.
3. **Botones de acción compartidos** (primario/secundario/peligro/cerrar con ripple). Corrige H6.
4. **Tokens de capas y color**: eliminar z-index literales, usar solo los de `styles.css`. Corrige H8.
5. **`notes-workspace` → `pages/notes/`** con ruta propia y el toggle navegando. Corrige H1. Depende de decisión de UX (ver pregunta abierta).
## 5. Decisión del usuario (2026-11-04)
- La vista Notas **sigue siendo estado en `localStorage`** (sin ruta propia), pero el componente se mueve a `pages/notes/`, igual que `pages/board`.
- Plan de producto posterior (no implementado): el switch pasará a **Todo / Checklists / Notas**. "Todo" mostrará checklists + notas bajo `thelister.atenis.app/#/all` (hash routing); el switch alternará entre las pages `board` y `notes`. Lo que se construya ahora debe permitirlo sin rehacerse.
- Los pasos están en `claude/02-prompt-refactor-ui-fab-sheet-notes.md`.
## 6. Fuera de alcance de esta auditoría
- Specs existentes (`notes-workspace.component.spec.ts`): no se revisó su cobertura.
- Comportamiento real en Android/iOS (H5 y partes de H3 requieren verificación en dispositivo o con Playwright).