import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import {
  MOBILE_PRESENTATION_MAX_WIDTH,
  isMobilePresentationWidth
} from '../core/ui/mobile-presentation/mobile-presentation';

function createQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(`(max-width: ${MOBILE_PRESENTATION_MAX_WIDTH}px)`);
  } catch {
    return null;
  }
}

function initialValue(query: MediaQueryList | null): boolean {
  if (query) return query.matches;
  return typeof window !== 'undefined' ? isMobilePresentationWidth(window.innerWidth) : false;
}

/**
 * Única fuente de la presentación móvil (PARTE C4-C5).
 *
 * Expone el valor VIVO para lo que debe reaccionar al redimensionar (refresher,
 * masonry) y `snapshot()` para que cada overlay decida su variante al abrirse y
 * no cambie a mitad de uso. El umbral vive en `core/ui/mobile-presentation`.
 */
@Injectable({ providedIn: 'root' })
export class MobilePresentationService {
  private readonly query = createQuery();
  private readonly mobile = signal(initialValue(this.query));
  private readonly onQueryChange = (event: MediaQueryListEvent): void => {
    this.mobile.set(event.matches);
  };

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.query?.addEventListener('change', this.onQueryChange);
    destroyRef.onDestroy(() => this.query?.removeEventListener('change', this.onQueryChange));
  }

  /** Valor vivo: cambia con el ancho de la ventana. */
  isMobile(): boolean {
    return this.mobile();
  }

  /** Instantánea para decidir la variante de un overlay al abrirlo. */
  snapshot(): boolean {
    return this.mobile();
  }
}
