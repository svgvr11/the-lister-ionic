import {
  AfterViewInit,
  Directive,
  ElementRef,
  Input,
  OnDestroy,
  inject
} from '@angular/core';
import {
  applyMasonryLayout,
  MASONRY_BREAKPOINT_PX,
  MASONRY_DESKTOP_COLUMNS,
  MASONRY_GAP,
  MASONRY_MOBILE_COLUMNS,
  MASONRY_MOBILE_MAX_WIDTH,
  MasonryLayoutOptions
} from '../core/masonry-layout';

/**
 * Directiva standalone para maquetado masonry de tarjetas.
 *
 * Se aplica sobre el contenedor (`[appMasonry]`) y posiciona automáticamente a sus hijos
 * directos o a los que coincidan con `itemSelector` en la columna más corta (3 en escritorio,
 * 1 en móvil ≤700px), sin dejar huecos verticales.
 *
 * Maneja ResizeObserver, MutationObserver, requestAnimationFrame y ofrece el método
 * público `scheduleLayout()` para relayouts manuales ante cambios de contenido interno.
 */
@Directive({
  selector: '[appMasonry]',
  standalone: true,
  exportAs: 'appMasonry'
})
export class MasonryDirective implements AfterViewInit, OnDestroy {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  @Input() itemSelector = ':scope > *:not([data-masonry-ignore])';
  @Input() gap = MASONRY_GAP;
  @Input() breakpoint = MASONRY_BREAKPOINT_PX;
  @Input() mobileMaxWidth = MASONRY_MOBILE_MAX_WIDTH;
  @Input() desktopColumns = MASONRY_DESKTOP_COLUMNS;
  @Input() mobileColumns = MASONRY_MOBILE_COLUMNS;
  @Input() isMobile?: boolean;

  private layoutFrame: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private mediaQuery: MediaQueryList | null = null;
  private mediaQueryListener: ((e: MediaQueryListEvent) => void) | null = null;

  ngAfterViewInit(): void {
    this.initMediaQuery();
    this.initResizeObserver();
    this.initMutationObserver();
    this.scheduleLayout();
  }

  ngOnDestroy(): void {
    if (this.layoutFrame !== null) {
      cancelAnimationFrame(this.layoutFrame);
      this.layoutFrame = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    if (this.mediaQuery && this.mediaQueryListener) {
      this.mediaQuery.removeEventListener('change', this.mediaQueryListener);
      this.mediaQuery = null;
      this.mediaQueryListener = null;
    }
  }

  private initMediaQuery(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    this.mediaQuery = window.matchMedia(`(max-width: ${this.breakpoint}px)`);
    this.mediaQueryListener = () => this.scheduleLayout();
    this.mediaQuery.addEventListener('change', this.mediaQueryListener);
  }

  private initResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;
    const container = this.elementRef.nativeElement;
    this.resizeObserver = new ResizeObserver(() => this.scheduleLayout());
    this.resizeObserver.observe(container);
  }

  private initMutationObserver(): void {
    if (typeof MutationObserver === 'undefined') return;
    const container = this.elementRef.nativeElement;
    this.mutationObserver = new MutationObserver(() => this.scheduleLayout());
    this.mutationObserver.observe(container, {
      childList: true,
      subtree: false
    });
  }

  private getItems(): HTMLElement[] {
    const container = this.elementRef.nativeElement;
    if (!container) return [];
    try {
      return Array.from(container.querySelectorAll<HTMLElement>(this.itemSelector));
    } catch {
      return Array.from(container.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
    }
  }

  /**
   * Programa el cálculo y colocación visual de las tarjetas en el siguiente fotograma.
   */
  scheduleLayout(): void {
    if (this.layoutFrame !== null) cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = null;
      this.layout();
    });
  }

  /**
   * Ejecuta inmediatamente el cálculo y colocación visual de las tarjetas.
   */
  layout(): boolean {
    const container = this.elementRef.nativeElement;
    const items = this.getItems();
    const options: MasonryLayoutOptions = {
      gap: this.gap,
      breakpoint: this.breakpoint,
      mobileMaxWidth: this.mobileMaxWidth,
      desktopColumns: this.desktopColumns,
      mobileColumns: this.mobileColumns,
      isMobile: this.isMobile ?? (this.mediaQuery ? this.mediaQuery.matches : undefined)
    };
    return applyMasonryLayout(container, items, options);
  }
}
