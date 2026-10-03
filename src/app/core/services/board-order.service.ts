import { Injectable, inject } from '@angular/core';
import type { OrderableList, Rng } from '../session-order';
import { computeDisplayOrder, createSessionOrder, reconcileSessionOrder } from '../session-order';
import { AuthService } from './auth.service';

/**
 * Orden aleatorio de las listas durante una sesión de la app.
 *
 * Vive fuera de las páginas a propósito: al ir al basurero y volver el tablero se
 * reconstruye, y el orden no debe cambiar. Tampoco guarda nada —ni en el tablero ni en
 * la nube— porque el orden es solo de visualización.
 */
@Injectable({ providedIn: 'root' })
export class BoardOrderService {
  private readonly auth = inject(AuthService);
  /** Ids en el orden de esta sesión; null significa que todavía no se ha barajado. */
  private order: string[] | null = null;
  private lastUserId: string | null = this.auth.session?.user.id ?? null;

  constructor() {
    // El orden dura lo que dura la sesión de la app: al cerrar sesión (o al eliminar la
    // cuenta, que también cierra la sesión) se descarta y la próxima vez se vuelve a barajar.
    this.auth.sessionChanges.subscribe((session) => {
      const userId = session?.user.id ?? null;
      if (userId === this.lastUserId) return;
      this.lastUserId = userId;
      this.reset();
    });
  }

  /** Ids en el orden de esta sesión, en copia: el estado interno no se expone. */
  get sessionOrder(): string[] {
    return this.order ? [...this.order] : [];
  }

  /**
   * Alinea el orden de sesión con las listas del tablero. Baraja una única vez (al
   * llegar el primer tablero con listas) y a partir de ahí solo retira lo que desaparece
   * y añade al final lo que llega. Devuelve si el orden de dibujo ha cambiado, para que
   * quien lo llama repinte la rejilla masonry.
   */
  sync(lists: OrderableList[], pinnedId: string | null | undefined, rng: Rng = Math.random): boolean {
    const before = this.displayOrder(lists, pinnedId);
    if (this.order === null) {
      // Todavía no se ha barajado en esta sesión: se espera al primer tablero CON listas,
      // para que un tablero vacío al arrancar no se quede sin mezclar después.
      if (lists.length > 0) this.order = createSessionOrder(lists, pinnedId, rng);
    } else {
      this.order = reconcileSessionOrder(lists, this.order);
    }
    const after = this.displayOrder(lists, pinnedId);
    return before.length !== after.length || before.some((id, index) => id !== after[index]);
  }

  /** Orden de dibujo actual: la pinneada primero y el resto en orden de sesión. */
  displayOrder(lists: OrderableList[], pinnedId: string | null | undefined): string[] {
    return computeDisplayOrder(lists, pinnedId, this.order ?? []).order;
  }

  /** Cierra la sesión de orden: la próxima vez se vuelve a barajar. */
  reset(): void {
    this.order = null;
  }
}
