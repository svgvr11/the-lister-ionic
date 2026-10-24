/**
 * Reordenamiento de LISTAS con `@angular/cdk/drag-drop` (vista Tarjetas, táctil).
 *
 * Todo lo que se puede decidir sin DOM vive aquí, para poder probarlo sin montar el
 * componente. El arrastre de escritorio (HTML5) sigue teniendo su propia regla de
 * negocio en `board-list-rules.ts` (`moveListBefore`), que es la ÚNICA que mueve
 * listas: este módulo solo traduce los índices que publica CDK a esa llamada.
 *
 * Un solo motor a la vez (ANEXO 7): con CDK activo la tarjeta de la vista Tarjetas
 * nunca lleva `draggable` nativo, y con HTML5 activo no lleva `cdkDrag`. Elige
 * `resolveReorderEngine` según el dispositivo.
 */

/** Motor de reordenamiento activo. */
export type ReorderEngine = 'cdk' | 'html5';

/**
 * Interruptor global del motor CDK. Volver a `'html5'` desactiva el reordenamiento
 * táctil de la vista Tarjetas sin revertir nada más: es la salida de emergencia.
 */
export const LIST_REORDER_ENGINE: ReorderEngine = 'cdk';

/**
 * Cómo arranca el arrastre con el dedo. `'longpress'`: pulsación larga de
 * `CDK_DRAG_START_DELAY_MS` y el deslizamiento normal sigue haciendo scroll.
 * El respaldo documentado es `'handle'` (asa visible con `cdkDragHandle`, sin
 * `cdkDragStartDelay`): si se cambia, hay que poner además `cdkDragHandle` en el
 * asa de la tarjeta; hasta entonces el arrastre no arranca, que es el
 * comportamiento seguro.
 */
export const TOUCH_REORDER_ACTIVATION: 'longpress' | 'handle' = 'longpress';

/** Milisegundos de pulsación larga antes de que CDK considere iniciado el arrastre. */
export const CDK_DRAG_START_DELAY_MS = 400;

/** Ancho de ventana a partir del cual se considera pantalla ancha (escritorio). */
export const CDK_TOUCH_MAX_WIDTH = 700;

/**
 * Altura máxima de la previsualización de arrastre de una lista en la vista de lista.
 *
 * Las tarjetas de esa vista pueden tener 40 tareas: arrastrarlas enteras taparía media
 * pantalla. La previsualización y el hueco muestran la tarjeta COLAPSADA (cabecera,
 * barra y contador), y este tope es el que se usa en la plantilla y en los estilos.
 */
export const LIST_PREVIEW_MAX_HEIGHT_PX = 108;

/**
 * Ventana, tras soltar o cancelar un arrastre, en la que el clic que emite el navegador
 * se come en lugar de abrir el modal de la lista. Sin ella, un arrastre que acaba donde
 * empezó (pulsación larga sin mover) abriría el modal sin que el usuario lo pidiera.
 */
export const CARD_CLICK_SUPPRESS_MS = 400;

/**
 * Red de seguridad del estado de arrastre: si CDK no emitiera el fin (por una tarjeta que
 * desaparece a mitad del gesto, por ejemplo), este plazo limpia la bandera y con ella el
 * bloqueo del remoto pendiente y del botón Atrás.
 */
export const CDK_DRAG_SAFETY_TIMEOUT_MS = 30000;

/**
 * Motor que corresponde a un dispositivo: táctil, o ventana de 700px o menos
 * (móvil), usan CDK; el resto (ratón en escritorio) se queda con HTML5.
 */
export function resolveReorderEngine(input: { touch: boolean; width: number }): ReorderEngine {
  return input.touch || input.width <= CDK_TOUCH_MAX_WIDTH ? 'cdk' : 'html5';
}

/**
 * ¿Puede caer una tarjeta en este índice del orden visible? La fijada ocupa el
 * índice 0 y nada se coloca delante de ella, así que el 0 está vetado siempre
 * que haya fijada. Refuerza visualmente lo que ya garantiza `moveListBefore`
 * (`Math.max(target, 1)`). Se usa como `cdkDropListSortPredicate`.
 */
export function canSortBeforePinned(index: number, pinnedListId: string | null): boolean {
  return pinnedListId === null || index > 0;
}

/** Lo que CDK publica al soltar, traducido a los datos del tablero. */
export interface CdkReorderInput {
  /** Ids de las listas visibles, en el orden con el que se dibujan. */
  visibleIds: string[];
  /** Índice de la tarjeta al empezar el arrastre. */
  previousIndex: number;
  /** Índice que ocupa la tarjeta al soltar. */
  currentIndex: number;
  /** Lista fijada al inicio del tablero, si hay. */
  pinnedListId: string | null;
  /** Hay búsqueda activa: la vista está filtrada y no se reordena. */
  searching: boolean;
}

/** Traducción del soltable: la lista que se mueve y delante de qué lista cae. */
export interface CdkReorderPlan {
  listId: string;
  /** `null` = al final del tablero. */
  targetId: string | null;
}

/**
 * Convierte `(previousIndex, currentIndex)` de CDK en la llamada de negocio
 * `moveListBefore(board, listId, targetId)`. Devuelve `null` cuando no hay nada
 * que mover: búsqueda activa, 0 o 1 elementos visibles, índices fuera de rango,
 * soltar en el mismo índice, o que la arrastrada sea la fijada (su `cdkDragDisabled`
 * ya lo impedía, pero el estado puede cambiar a mitad del gesto).
 */
export function planCdkReorder(input: CdkReorderInput): CdkReorderPlan | null {
  const { visibleIds, previousIndex, currentIndex, pinnedListId, searching } = input;
  if (searching) return null;
  if (visibleIds.length < 2) return null;
  if (!Number.isInteger(previousIndex) || !Number.isInteger(currentIndex)) return null;
  if (previousIndex < 0 || previousIndex >= visibleIds.length) return null;
  if (currentIndex < 0 || currentIndex >= visibleIds.length) return null;
  if (previousIndex === currentIndex) return null;
  const listId = visibleIds[previousIndex];
  if (pinnedListId !== null && listId === pinnedListId) return null;

  const rest = visibleIds.filter((_, index) => index !== previousIndex);
  return {
    listId,
    targetId: currentIndex < rest.length ? rest[currentIndex] : null
  };
}

// ── Auto-scroll propio ───────────────────────────────────────────────────────
// CDK no ve el scroller de `ion-content` (vive en su shadow DOM), así que su
// auto-scroll se desactiva y lo escribe esta página: `scrollByPoint` sobre el
// `IonContent`.

/** Zona de borde (px) en la que el auto-scroll se activa. */
export const AUTO_SCROLL_EDGE_PX = 72;

/** Paso mínimo por fotograma: arranca lento (~3-4 px), como pide el plan. */
export const AUTO_SCROLL_MIN_STEP_PX = 3;

/** Paso máximo por fotograma cuando el dedo está justo en el borde. */
export const AUTO_SCROLL_MAX_STEP_PX = 14;

/**
 * Paso de scroll (px por fotograma) para la posición del puntero dentro del
 * scroller, o 0 si está fuera de la zona de borde. Positivo = hacia abajo,
 * negativo = hacia arriba. La velocidad crece con la cercanía al borde.
 */
export function autoScrollStepFor(
  pointerY: number,
  scrollTop: number,
  scrollBottom: number
): number {
  const distanceToTop = pointerY - scrollTop;
  const distanceToBottom = scrollBottom - pointerY;
  if (distanceToTop >= 0 && distanceToTop < AUTO_SCROLL_EDGE_PX) {
    const closeness = 1 - distanceToTop / AUTO_SCROLL_EDGE_PX;
    return -Math.round(
      AUTO_SCROLL_MIN_STEP_PX
        + (AUTO_SCROLL_MAX_STEP_PX - AUTO_SCROLL_MIN_STEP_PX) * closeness
    );
  }
  if (distanceToBottom >= 0 && distanceToBottom < AUTO_SCROLL_EDGE_PX) {
    const closeness = 1 - distanceToBottom / AUTO_SCROLL_EDGE_PX;
    return Math.round(
      AUTO_SCROLL_MIN_STEP_PX
        + (AUTO_SCROLL_MAX_STEP_PX - AUTO_SCROLL_MIN_STEP_PX) * closeness
    );
  }
  return 0;
}

/**
 * Aviso de desplazamiento para la estrategia de orden de CDK.
 *
 * El auto-scroll propio mueve el contenido hacia abajo `step` píxeles, así que cada
 * tarjeta SUBE `step` píxeles en el viewport: el aviso lleva el signo contrario. Es lo
 * mismo que calcula CDK con su propio listener de scroll (`topDifference`), con la
 * diferencia de que aquí lo emitimos nosotros porque el scroller de `ion-content` vive
 * en su shadow DOM y su evento `scroll` no cruza la frontera.
 */
export function cdkScrollNotice(step: number): { top: number; left: number } {
  // `-0` no es `0` a efectos de comparación: sin desplazamiento se avisa 0 exacto.
  return { top: step === 0 ? 0 : -step, left: 0 };
}

// ── El toque que cierra el arrastre ──────────────────────────────────────────

/**
 * ¿Abre el modal de la lista este clic sobre la tarjeta? Durante el arrastre no, y
 * durante `CARD_CLICK_SUPPRESS_MS` después tampoco: el navegador emite un `click` al
 * levantar el dedo y ese clic no es una decisión del usuario. El clic siguiente sí abre.
 */
export function shouldOpenCardFocus(input: {
  dragActive: boolean;
  suppressClickUntil: number;
  now: number;
}): boolean {
  if (input.dragActive) return false;
  return input.now >= input.suppressClickUntil;
}
