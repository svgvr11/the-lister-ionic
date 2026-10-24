/**
 * Parámetros y cálculo puro del maquetado masonry de tarjetas.
 *
 * Comparte la misma distribución entre el tablero (/board), el basurero (/trash)
 * y el archivo (/archive).
 *
 * El número de columnas lo decide EL ANCHO DEL CONTENEDOR, no el de la ventana:
 * 3 columnas desde 1000 px, 2 entre 640 y 999 px y 1 por debajo. En 1 columna la
 * tarjeta se centra con un máximo de 520 px, que es el móvil en vertical de siempre.
 *
 * Los umbrales llevan histéresis para no oscilar: al aparecer o desaparecer la barra
 * de scroll vertical el ancho del contenedor cambia unos píxeles y eso no debe
 * alternar el número de columnas en bucle.
 */

export interface MasonryLayoutOptions {
  gap?: number;
  mobileMaxWidth?: number;
  /** Columnas de la pasada anterior: con ellas se aplica la histéresis. */
  currentColumns?: number;
}

export interface MasonryItemPosition {
  left: number;
  top: number;
  width: number;
  column: number;
}

export interface MasonryLayoutResult {
  positions: MasonryItemPosition[];
  totalHeight: number;
  columns: number;
  itemWidth: number;
  isMobile: boolean;
}

/** Resultado de aplicar el maquetado al DOM. */
export interface MasonryApplyResult {
  /** false si no se pudo maquetar (contenedor ausente o con ancho 0): se reintentará. */
  success: boolean;
  /** Columnas usadas en esta pasada; 0 si no se colocó nada. */
  columns: number;
}

/** Separación entre tarjetas, en horizontal y en vertical. */
export const MASONRY_GAP = 22;
/** Máximo de columnas en paralelo. */
export const MASONRY_MAX_COLUMNS = 3;
/** Ancho de contenedor a partir del cual caben 3 columnas. */
export const MASONRY_THREE_COLUMNS_MIN_WIDTH = 1000;
/** Ancho de contenedor a partir del cual caben 2 columnas. */
export const MASONRY_TWO_COLUMNS_MIN_WIDTH = 640;
/** En 1 columna la tarjeta se centra y no pasa de este ancho (móvil en vertical). */
export const MASONRY_MOBILE_MAX_WIDTH = 520;
/**
 * Margen de histéresis alrededor de cada umbral. Subir de N a N+1 columnas exige
 * umbral + HISTERESIS; bajar exige umbral − HISTERESIS. Evita el bucle cuando la
 * barra de scroll vertical aparece o desaparece y mueve el ancho unos pocos píxeles.
 */
export const MASONRY_HYSTERESIS_PX = 16;

/**
 * ¿La rejilla va en FLUJO NORMAL en lugar de en masonry?
 *
 * Una sola columna no necesita posiciones absolutas: con `display:flex; column` y el
 * mismo `gap` y el mismo ancho máximo el resultado es idéntico, y el contenedor mide
 * solo. Eso es imprescindible para el reordenamiento con `@angular/cdk/drag-drop`, que
 * reordena moviendo nodos del DOM: con `position:absolute` y `top` en línea el nodo se
 * mueve pero la posición no, así que el orden visual no sigue al DOM.
 *
 * La histéresis es la misma que usa `computeColumnCount`, para que la rotación o una
 * barra de scroll que aparece y desaparece no hagan oscilar el maquetado.
 *
 * @param currentFlow Modo actual: `true` = flujo normal.
 * @param containerWidth Ancho del contenedor de tarjetas.
 */
export function resolveBoardFlowMode(currentFlow: boolean, containerWidth: number): boolean {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return currentFlow;
  const toFlow = containerWidth < MASONRY_TWO_COLUMNS_MIN_WIDTH - MASONRY_HYSTERESIS_PX;
  const toMasonry = containerWidth >= MASONRY_TWO_COLUMNS_MIN_WIDTH + MASONRY_HYSTERESIS_PX;
  return currentFlow ? !toMasonry : toFlow;
}

/**
 * Ancho mínimo de contenedor que sostiene `columns` columnas.
 *
 * Única fuente de los umbrales: de aquí salen las comparaciones de
 * `computeColumnCount`, de modo que no puedan desincronizarse.
 */
function columnThreshold(columns: number): number {
  if (columns >= MASONRY_MAX_COLUMNS) return MASONRY_THREE_COLUMNS_MIN_WIDTH;
  if (columns === 2) return MASONRY_TWO_COLUMNS_MIN_WIDTH;
  return 0;
}

/**
 * Número de columnas para un ancho de contenedor dado.
 *
 * Sin columnas previas (primera pasada, `currentColumns` ausente o 0) usa los
 * umbrales pelados: 3 desde 1000 px, 2 desde 640 px, 1 por debajo.
 *
 * Con columnas previas aplica histéresis respecto a las columnas ACTUALES:
 * - subir de N a N+1 exige `umbral(N+1) + HYSTERESIS`;
 * - bajar de N a N−1 exige `umbral(N) − HYSTERESIS`;
 * - entre medios se conserva N.
 *
 * Devuelve 0 si el ancho no es positivo: con ancho 0 no se coloca nada.
 */
export function computeColumnCount(containerWidth: number, currentColumns?: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 0;

  const desired = containerWidth >= MASONRY_THREE_COLUMNS_MIN_WIDTH
    ? MASONRY_MAX_COLUMNS
    : containerWidth >= MASONRY_TWO_COLUMNS_MIN_WIDTH
      ? 2
      : 1;

  const previous = Math.min(Math.max(currentColumns ?? 0, 0), MASONRY_MAX_COLUMNS);
  // Primera pasada, o el resultado deseado ya coincide: no hay nada que amortiguar.
  if (previous === 0 || previous === desired) return desired;

  if (desired > previous) {
    return containerWidth >= columnThreshold(desired) + MASONRY_HYSTERESIS_PX
      ? desired
      : previous;
  }

  return containerWidth < columnThreshold(previous) - MASONRY_HYSTERESIS_PX
    ? desired
    : previous;
}

/**
 * Ancho de tarjeta: `(contenedor − gaps) / columnas`.
 *
 * En 1 columna se mantiene el máximo de hoy (520 px) centrado, para no cambiar el
 * móvil en vertical. Devuelve 0 si no hay ancho o no hay columnas.
 */
export function computeCardWidth(
  containerWidth: number,
  columns: number,
  options?: MasonryLayoutOptions
): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0 || columns <= 0) return 0;
  const gap = options?.gap ?? MASONRY_GAP;
  const mobileMaxWidth = options?.mobileMaxWidth ?? MASONRY_MOBILE_MAX_WIDTH;
  if (columns === 1) return Math.min(containerWidth, mobileMaxWidth);
  return Math.max(0, (containerWidth - gap * (columns - 1)) / columns);
}

/**
 * Cálculo puro de posiciones y altura para el maquetado masonry.
 *
 * Coloca cada elemento en la columna que tenga menor altura acumulada.
 * Las columnas salen del ancho del contenedor (`computeColumnCount`) y el ancho de
 * cada tarjeta de `computeCardWidth`.
 * Si el ancho es 0 o no hay elementos, no posiciona nada y devuelve totalHeight = 0.
 * La altura total resultante resta el GAP final para evitar espacio sobrante.
 */
export function calculateMasonryPositions(
  containerWidth: number,
  itemHeights: number[],
  options?: MasonryLayoutOptions
): MasonryLayoutResult {
  const gap = options?.gap ?? MASONRY_GAP;

  if (containerWidth <= 0 || itemHeights.length === 0) {
    return {
      positions: [],
      totalHeight: 0,
      columns: 0,
      itemWidth: 0,
      isMobile: false
    };
  }

  const columns = computeColumnCount(containerWidth, options?.currentColumns);
  const itemWidth = computeCardWidth(containerWidth, columns, options);
  const isMobile = columns === 1;

  const heights = new Array(columns).fill(0);
  const positions: MasonryItemPosition[] = [];

  for (let i = 0; i < itemHeights.length; i++) {
    const itemHeight = itemHeights[i];
    const column = heights.indexOf(Math.min(...heights));
    const x = isMobile
      ? (containerWidth - itemWidth) / 2
      : column * (itemWidth + gap);
    const y = heights[column];

    positions.push({
      left: x,
      top: y,
      width: itemWidth,
      column
    });

    heights[column] = y + itemHeight + gap;
  }

  const occupied = Math.max(...heights, 0);
  const totalHeight = itemHeights.length > 0 ? Math.max(occupied - gap, 0) : 0;

  return {
    positions,
    totalHeight,
    columns,
    itemWidth,
    isMobile
  };
}

/**
 * Aplica el maquetado masonry a elementos del DOM.
 *
 * Las columnas y el ancho de tarjeta salen del ancho del CONTENEDOR
 * (`computeColumnCount` / `computeCardWidth`), nunca de la ventana.
 *
 * Conserva la altura vigente mediante min-height durante la medición para evitar
 * pérdidas de scroll (scrollTop colapsando a 0). Mide todas las alturas antes de
 * escribir posiciones, para no encadenar reflujos.
 *
 * Si clientWidth === 0 (p. ej. pantalla oculta o en transición), sale inmediatamente
 * sin tocar las posiciones para que el observador reintente al recuperar el tamaño.
 */
export function applyMasonryLayout(
  container: HTMLElement | null | undefined,
  items: (HTMLElement | null | undefined)[] | null | undefined,
  options?: MasonryLayoutOptions
): MasonryApplyResult {
  if (!container) return { success: false, columns: 0 };
  const validItems = (items ?? []).filter((item): item is HTMLElement => Boolean(item));

  if (validItems.length === 0) {
    container.style.height = '';
    return { success: true, columns: 0 };
  }

  // Con ancho 0 la página está oculta o todavía sin maquetar (pasa al volver del
  // basurero o de otra pantalla). Grabar las posiciones con ancho 0 deja las tarjetas
  // superpuestas y nada las arregla después, así que se sale sin tocar nada: el
  // observador reintenta en cuanto el contenedor recupera su tamaño.
  if (container.clientWidth === 0) return { success: false, columns: 0 };

  const gap = options?.gap ?? MASONRY_GAP;
  const containerWidth = container.clientWidth;
  const columns = computeColumnCount(containerWidth, options?.currentColumns);
  const itemWidth = computeCardWidth(containerWidth, columns, options);
  const isMobile = columns === 1;

  const heights = new Array(columns).fill(0);

  container.style.position = 'relative';

  // La altura vigente se mantiene mientras se mide; min-height la protege aunque el
  // alto explícito esté a punto de recalcularse. Se anula al final para no arrastrar
  // el valor viejo cuando el tablero crece o se encoge.
  const previousHeight = container.getBoundingClientRect().height;
  container.style.minHeight = `${previousHeight}px`;

  // El ancho basta para medir: la tarjeta conserva su posición anterior hasta que
  // se le asigna la definitiva, y así nunca se apilan en top:0.
  validItems.forEach((item) => {
    item.style.position = 'absolute';
    item.style.width = `${itemWidth}px`;
  });

  void container.offsetHeight;

  // Lectura de todas las alturas primero (un solo reflujo) y escritura después.
  const measuredHeights = validItems.map((item) => item.offsetHeight);

  validItems.forEach((item, index) => {
    const column = heights.indexOf(Math.min(...heights));
    const x = isMobile
      ? (containerWidth - itemWidth) / 2
      : column * (itemWidth + gap);
    const y = heights[column];
    item.style.left = `${x}px`;
    item.style.top = `${y}px`;
    heights[column] = y + measuredHeights[index] + gap;
  });

  container.style.minHeight = '';
  // heights[column] ya incluye un GAP de separación detrás de la última tarjeta de cada
  // columna, así que la altura real del contenedor es esa suma menos ese hueco final. Sin
  // restarlo, el pie queda ese GAP más abajo que el resto del diseño.
  const occupied = Math.max(...heights, 0);
  container.style.height = `${validItems.length > 0 ? Math.max(occupied - gap, 0) : 0}px`;
  return { success: true, columns };
}

export interface MasonryControllerConfig extends MasonryLayoutOptions {
  getContainer: () => HTMLElement | null | undefined;
  getItems: () => (HTMLElement | null | undefined)[];
  onLayout?: (result: MasonryApplyResult) => void;
  /**
   * ¿Toca maquetar en esta pasada? Se pregunta antes de calcular, así que quien lo
   * use puede decidir en el último momento. El tablero lo usa para el flujo normal de
   * una columna: cuando el reordenamiento táctil con CDK está en juego, maquetar con
   * posiciones absolutas impediría reordenar (mover el nodo no cambia su `top`).
   */
  canLayout?: () => boolean;
  /** Se avisa cuando una pasada se salta por `canLayout`, para que el titular limpie. */
  onSkipLayout?: () => void;
}

/**
 * Ciclo de vida del maquetado masonry: una sola implementación para el tablero, el
 * basurero y el archivo.
 *
 * Arregla el bug de que el masonry no se readaptaba al cambiar el ancho de la
 * ventana. La causa era que el observador se conectaba una única vez, antes de que
 * el `*ngIf` creara la rejilla, así que se quedaba atado a un nodo que ya no existía
 * (o no se conectaba nunca). Aquí:
 *
 * - `observe()` se llama cada vez que el contenedor aparece (setter de `@ViewChild`)
 *   y se ata al nodo VIVO, con `disconnect()` previo: nunca hay más de un nodo observado.
 * - `release()` suelta la referencia cuando el `*ngIf` destruye el contenedor.
 * - `scheduleLayout()` vuelve a comprobar el nodo antes de calcular, como respaldo por
 *   si el contenedor se recreó sin pasar por el setter.
 * - `requestAnimationFrame` agrupa las peticiones y las columnas de la pasada anterior
 *   se recuerdan para aplicar la histéresis.
 */
export class MasonryController {
  private readonly config: MasonryControllerConfig;
  private layoutFrame: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  /** Nodo observado actualmente: con él se detecta que el contenedor se recreó. */
  private observedTarget: HTMLElement | null = null;
  /** Columnas de la última pasada válida: base de la histéresis. */
  private currentColumns = 0;

  constructor(config: MasonryControllerConfig) {
    this.config = config;
  }

  /**
   * Ata el observador al contenedor indicado (o al que devuelva `getContainer`).
   *
   * Es idempotente respecto al nodo: si ya observa ese mismo elemento no hace nada.
   * Si el contenedor cambió (el `*ngIf` lo recreó), suelta el anterior antes de
   * observar el nuevo, de modo que nunca queden dos nodos observados a la vez.
   */
  observe(container?: HTMLElement | null): void {
    const target = container ?? this.config.getContainer();
    if (!target) return;
    if (typeof ResizeObserver === 'undefined') return;
    if (this.observedTarget === target) return;

    this.resizeObserver?.disconnect();
    this.resizeObserver ??= new ResizeObserver(() => this.scheduleLayout());
    this.observedTarget = target;
    this.resizeObserver.observe(target);
  }

  /** Suelta el observador: el contenedor dejó de existir. */
  release(container?: HTMLElement | null): void {
    const target = container ?? null;
    // Solo se suelta si el nodo que desaparece es el observado; si no, sigue vivo.
    if (target && this.observedTarget && target !== this.observedTarget) return;
    this.resizeObserver?.disconnect();
    this.observedTarget = null;
  }

  /**
   * Programa el recálculo en el siguiente fotograma.
   *
   * Antes de calcular se reconcilia el nodo observado con el contenedor vivo: si el
   * `*ngIf` recreó la rejilla sin avisar, se vuelve a observar y el layout usa el nuevo.
   */
  scheduleLayout(): void {
    this.syncObservedTarget();
    if (this.layoutFrame !== null) cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = null;
      this.layout();
    });
  }

  /** Recalcula ya. Devuelve si el maquetado pudo aplicarse. */
  layout(): boolean {
    if (this.config.canLayout && !this.config.canLayout()) {
      this.config.onSkipLayout?.();
      return false;
    }
    const container = this.config.getContainer();
    const items = this.config.getItems();
    const result = applyMasonryLayout(container, items, {
      gap: this.config.gap,
      mobileMaxWidth: this.config.mobileMaxWidth,
      currentColumns: this.currentColumns
    });
    // Solo una pasada válida actualiza la histéresis: con ancho 0 no se coloca nada y
    // conservar las columnas anteriores es justo lo que permite recalcular al volver.
    if (result.columns > 0) this.currentColumns = result.columns;
    this.config.onLayout?.(result);
    return result.success;
  }

  /** Libera observer y fotograma pendiente. Sin fugas. */
  disconnect(): void {
    if (this.layoutFrame !== null) {
      cancelAnimationFrame(this.layoutFrame);
      this.layoutFrame = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.observedTarget = null;
    this.currentColumns = 0;
  }

  /**
   * Respaldo de `observe()`: si el contenedor vivo ya no es el observado, se reconecta.
   * Cubre el caso de que el `*ngIf` recree el nodo sin que el setter se disparara.
   */
  private syncObservedTarget(): void {
    const target = this.config.getContainer();
    if (!target || this.observedTarget === target) return;
    this.observe(target);
  }
}
