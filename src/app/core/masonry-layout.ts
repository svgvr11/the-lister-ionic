/**
 * Parámetros y cálculo puro del maquetado masonry de tarjetas.
 *
 * Comparte la misma distribución entre el tablero (/board), el basurero (/trash)
 * y el archivo (/archive): 3 columnas en escritorio (>700px) y 1 columna en móvil (≤700px),
 * apilando cada tarjeta en la columna más corta para no dejar huecos verticales.
 */

export interface MasonryLayoutOptions {
  gap?: number;
  breakpoint?: number;
  mobileMaxWidth?: number;
  desktopColumns?: number;
  mobileColumns?: number;
  isMobile?: boolean;
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

export const MASONRY_GAP = 22;
export const MASONRY_BREAKPOINT_PX = 700;
export const MASONRY_MOBILE_MAX_WIDTH = 520;
export const MASONRY_DESKTOP_COLUMNS = 3;
export const MASONRY_MOBILE_COLUMNS = 1;

/**
 * Cálculo puro de posiciones y altura para el maquetado masonry.
 *
 * Coloca cada elemento en la columna que tenga menor altura acumulada.
 * En escritorio (>700px) usa 3 columnas. En móvil (≤700px) usa 1 columna centrada
 * con un ancho máximo de 520px.
 * Si el ancho es 0 o no hay elementos, no posiciona nada y devuelve totalHeight = 0.
 * La altura total resultante resta el GAP final para evitar espacio sobrante en el contenedor.
 */
export function calculateMasonryPositions(
  containerWidth: number,
  itemHeights: number[],
  options?: MasonryLayoutOptions
): MasonryLayoutResult {
  const gap = options?.gap ?? MASONRY_GAP;
  const breakpoint = options?.breakpoint ?? MASONRY_BREAKPOINT_PX;
  const mobileMaxWidth = options?.mobileMaxWidth ?? MASONRY_MOBILE_MAX_WIDTH;
  const desktopColumns = options?.desktopColumns ?? MASONRY_DESKTOP_COLUMNS;
  const mobileColumns = options?.mobileColumns ?? MASONRY_MOBILE_COLUMNS;

  if (containerWidth <= 0 || itemHeights.length === 0) {
    return {
      positions: [],
      totalHeight: 0,
      columns: 0,
      itemWidth: 0,
      isMobile: options?.isMobile ?? (containerWidth <= breakpoint)
    };
  }

  const isMobile = options?.isMobile ?? (containerWidth <= breakpoint);
  const columns = isMobile ? mobileColumns : desktopColumns;
  const itemWidth = isMobile
    ? Math.min(containerWidth, mobileMaxWidth)
    : Math.max(0, (containerWidth - gap * (columns - 1)) / columns);

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
 * Conserva la altura vigente mediante min-height durante la medición para evitar
 * pérdidas de scroll (scrollTop colapsando a 0).
 * Si clientWidth === 0 (p. ej. pantalla oculta o en transición), sale inmediatamente
 * sin tocar las posiciones para que el ResizeObserver reintente al recuperar el tamaño.
 */
export function applyMasonryLayout(
  container: HTMLElement | null | undefined,
  items: (HTMLElement | null | undefined)[] | null | undefined,
  options?: MasonryLayoutOptions
): boolean {
  if (!container) return false;
  const validItems = (items ?? []).filter((item): item is HTMLElement => Boolean(item));

  if (validItems.length === 0) {
    container.style.height = '';
    return true;
  }

  // Con ancho 0 la página está oculta o todavía sin maquetar (pasa al volver del
  // basurero o de otra pantalla). Grabar las posiciones con ancho 0 deja las tarjetas
  // superpuestas y nada las arregla después, así que se sale sin tocar nada: el
  // ResizeObserver reintenta en cuanto el contenedor recupera su tamaño.
  if (container.clientWidth === 0) return false;

  const gap = options?.gap ?? MASONRY_GAP;
  const breakpoint = options?.breakpoint ?? MASONRY_BREAKPOINT_PX;
  const mobileMaxWidth = options?.mobileMaxWidth ?? MASONRY_MOBILE_MAX_WIDTH;
  const desktopColumns = options?.desktopColumns ?? MASONRY_DESKTOP_COLUMNS;
  const mobileColumns = options?.mobileColumns ?? MASONRY_MOBILE_COLUMNS;

  const isMobile = options?.isMobile ?? (
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(`(max-width: ${breakpoint}px)`).matches
      : container.clientWidth <= breakpoint
  );

  const columns = isMobile ? mobileColumns : desktopColumns;
  const itemWidth = isMobile
    ? Math.min(container.clientWidth, mobileMaxWidth)
    : Math.max(0, (container.clientWidth - gap * (columns - 1)) / columns);
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

  validItems.forEach((item) => {
    const column = heights.indexOf(Math.min(...heights));
    const x = isMobile
      ? (container.clientWidth - itemWidth) / 2
      : column * (itemWidth + gap);
    const y = heights[column];
    item.style.left = `${x}px`;
    item.style.top = `${y}px`;
    heights[column] = y + item.offsetHeight + gap;
  });

  container.style.minHeight = '';
  // heights[column] ya incluye un GAP de separación detrás de la última tarjeta de cada
  // columna, así que la altura real del contenedor es esa suma menos ese hueco final. Sin
  // restarlo, el pie queda ese GAP más abajo que el resto del diseño.
  const occupied = Math.max(...heights, 0);
  container.style.height = `${validItems.length > 0 ? Math.max(occupied - gap, 0) : 0}px`;
  return true;
}

export interface MasonryControllerConfig extends MasonryLayoutOptions {
  getContainer: () => HTMLElement | null | undefined;
  getItems: () => (HTMLElement | null | undefined)[];
  onLayout?: (success: boolean) => void;
}

/**
 * Controlador de ciclo de vida del maquetado masonry.
 *
 * Administra el ResizeObserver del contenedor, la escucha del cambio de breakpoint móvil
 * y el throttling por requestAnimationFrame de las solicitudes de relayout.
 */
export class MasonryController {
  private readonly config: MasonryControllerConfig;
  private layoutFrame: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private mediaQuery: MediaQueryList | null = null;
  private mediaQueryListener: ((e: MediaQueryListEvent) => void) | null = null;

  constructor(config: MasonryControllerConfig) {
    this.config = config;
    this.initMediaQuery();
  }

  private initMediaQuery(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const breakpoint = this.config.breakpoint ?? MASONRY_BREAKPOINT_PX;
    this.mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`);
    this.mediaQueryListener = () => this.scheduleLayout();
    this.mediaQuery.addEventListener('change', this.mediaQueryListener);
  }

  get isMobile(): boolean {
    if (this.config.isMobile !== undefined) return this.config.isMobile;
    if (this.mediaQuery) return this.mediaQuery.matches;
    const container = this.config.getContainer();
    if (container && container.clientWidth > 0) {
      return container.clientWidth <= (this.config.breakpoint ?? MASONRY_BREAKPOINT_PX);
    }
    return false;
  }

  observe(container?: HTMLElement | null): void {
    const target = container ?? this.config.getContainer();
    if (!target) return;
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver ??= new ResizeObserver(() => this.scheduleLayout());
    this.resizeObserver.observe(target);
  }

  scheduleLayout(): void {
    if (this.layoutFrame !== null) cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = null;
      this.layout();
    });
  }

  layout(): boolean {
    const container = this.config.getContainer();
    const items = this.config.getItems();
    const success = applyMasonryLayout(container, items, {
      ...this.config,
      isMobile: this.isMobile
    });
    this.config.onLayout?.(success);
    return success;
  }

  disconnect(): void {
    if (this.layoutFrame !== null) {
      cancelAnimationFrame(this.layoutFrame);
      this.layoutFrame = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.mediaQuery && this.mediaQueryListener) {
      this.mediaQuery.removeEventListener('change', this.mediaQueryListener);
      this.mediaQuery = null;
      this.mediaQueryListener = null;
    }
  }
}
