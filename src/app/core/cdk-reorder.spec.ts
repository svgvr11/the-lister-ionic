import { describe, expect, it } from 'vitest';
import type { ChecklistBoard } from '../models/board.model';
import { moveListBefore, orderedLists } from './board-list-rules';
import {
  AUTO_SCROLL_EDGE_PX,
  AUTO_SCROLL_MAX_STEP_PX,
  AUTO_SCROLL_MIN_STEP_PX,
  CARD_CLICK_SUPPRESS_MS,
  CDK_DRAG_SAFETY_TIMEOUT_MS,
  CDK_DRAG_START_DELAY_MS,
  CDK_TOUCH_MAX_WIDTH,
  LIST_PREVIEW_MAX_HEIGHT_PX,
  LIST_REORDER_ENGINE,
  autoScrollStepFor,
  canSortBeforePinned,
  cdkScrollNotice,
  planCdkReorder,
  resolveReorderEngine,
  shouldOpenCardFocus
} from './cdk-reorder';

/**
 * Reordenamiento táctil de listas con `@angular/cdk/drag-drop` (vista Tarjetas).
 *
 * La lógica pura vive en `cdk-reorder.ts`; aquí se fija su comportamiento y se
 * comprueba contra la regla de negocio real (`moveListBefore`) que la traducción
 * de índices produce el mismo orden que el que se ve en pantalla.
 */

/** Tablero con N listas y posiciones consecutivas, como las deja `applyDisplayOrder`. */
const tableroCon = (cantidad: number, pinnedListId: string | null = null): ChecklistBoard => ({
  id: 'board-1',
  title: 'Mi tablero',
  createdAt: '2026-01-01T00:00:00.000Z',
  lists: Array.from({ length: cantidad }, (_, index) => ({
    id: `l${index}`,
    boardId: 'board-1',
    title: `Lista ${index + 1}`,
    position: index,
    createdAt: '2026-01-01T00:00:00.000Z',
    tasks: []
  })),
  pinnedListId
});

/** Aplica el plan sobre un tablero real y devuelve el orden de dibujo resultante. */
const ordenTrasAplicar = (
  board: ChecklistBoard,
  plan: { listId: string; targetId: string | null }
): string[] => {
  expect(moveListBefore(board, plan.listId, plan.targetId)).toBe(true);
  return orderedLists(board).map((list) => list.id);
};

describe('cdk-reorder: el interruptor de motor', () => {
  it('el interruptor publicado es el motor CDK', () => {
    expect(LIST_REORDER_ENGINE).toBe('cdk');
  });

  it('un dispositivo táctil usa CDK aunque la ventana sea ancha', () => {
    expect(resolveReorderEngine({ touch: true, width: 1440 })).toBe('cdk');
  });

  it('una ventana estrecha sin táctil también usa CDK', () => {
    expect(resolveReorderEngine({ touch: false, width: CDK_TOUCH_MAX_WIDTH })).toBe('cdk');
    expect(resolveReorderEngine({ touch: false, width: 390 })).toBe('cdk');
  });

  it('un escritorio con ratón se queda con HTML5', () => {
    expect(resolveReorderEngine({ touch: false, width: CDK_TOUCH_MAX_WIDTH + 1 })).toBe('html5');
    expect(resolveReorderEngine({ touch: false, width: 1920 })).toBe('html5');
  });
});

describe('cdk-reorder: la fijada no se mueve y nada se le pone delante', () => {
  it('con fijada en el índice 0 ningún índice está permitido antes que ella', () => {
    expect(canSortBeforePinned(0, 'l0')).toBe(false);
    expect(canSortBeforePinned(1, 'l0')).toBe(true);
    expect(canSortBeforePinned(6, 'l0')).toBe(true);
  });

  it('sin fijada se puede soltar en cualquier índice', () => {
    expect(canSortBeforePinned(0, null)).toBe(true);
    expect(canSortBeforePinned(9, null)).toBe(true);
  });
});

describe('cdk-reorder: los casos que no mueven nada', () => {
  const base = { visibleIds: ['l0', 'l1', 'l2', 'l3'], pinnedListId: null, searching: false };

  it('soltar en el mismo índice es un no-op', () => {
    expect(planCdkReorder({ ...base, previousIndex: 2, currentIndex: 2 })).toBeNull();
  });

  it('un índice fuera de rango no produce plan', () => {
    expect(planCdkReorder({ ...base, previousIndex: -1, currentIndex: 1 })).toBeNull();
    expect(planCdkReorder({ ...base, previousIndex: 0, currentIndex: 9 })).toBeNull();
    expect(planCdkReorder({ ...base, previousIndex: 4, currentIndex: 0 })).toBeNull();
  });

  it('con 0 o 1 listas visibles no se reordena', () => {
    expect(planCdkReorder({ ...base, visibleIds: [], previousIndex: 0, currentIndex: 1 })).toBeNull();
    expect(planCdkReorder({ ...base, visibleIds: ['l0'], previousIndex: 0, currentIndex: 1 })).toBeNull();
  });

  it('arrastrar la fijada no produce plan', () => {
    const conPin = { ...base, visibleIds: ['l0', 'l1', 'l2'], pinnedListId: 'l0' };
    expect(planCdkReorder({ ...conPin, previousIndex: 0, currentIndex: 2 })).toBeNull();
  });

  it('con la búsqueda activa no se reordena', () => {
    expect(planCdkReorder({ ...base, previousIndex: 0, currentIndex: 3, searching: true })).toBeNull();
  });
});

describe('cdk-reorder: la traducción a moveListBefore', () => {
  it('mover al principio coloca la lista la primera', () => {
    const board = tableroCon(4);
    const plan = planCdkReorder({
      visibleIds: ['l0', 'l1', 'l2', 'l3'],
      previousIndex: 3,
      currentIndex: 0,
      pinnedListId: null,
      searching: false
    });

    expect(plan).toEqual({ listId: 'l3', targetId: 'l0' });
    expect(ordenTrasAplicar(board, plan!)).toEqual(['l3', 'l0', 'l1', 'l2']);
  });

  it('mover al medio cuela la lista entre las dos', () => {
    const board = tableroCon(4);
    const plan = planCdkReorder({
      visibleIds: ['l0', 'l1', 'l2', 'l3'],
      previousIndex: 0,
      currentIndex: 2,
      pinnedListId: null,
      searching: false
    });

    // El destino se busca en la lista sin la arrastrada, así que el índice 2 de
    // `rest` ([l1, l2, l3]) es l3: soltarla delante de l3 la deja en el índice 2.
    expect(plan).toEqual({ listId: 'l0', targetId: 'l3' });
    expect(ordenTrasAplicar(board, plan!)).toEqual(['l1', 'l2', 'l0', 'l3']);
  });

  it('mover al final deja el destino en null', () => {
    const board = tableroCon(4);
    const plan = planCdkReorder({
      visibleIds: ['l0', 'l1', 'l2', 'l3'],
      previousIndex: 1,
      currentIndex: 3,
      pinnedListId: null,
      searching: false
    });

    expect(plan).toEqual({ listId: 'l1', targetId: null });
    expect(ordenTrasAplicar(board, plan!)).toEqual(['l0', 'l2', 'l3', 'l1']);
  });

  it('subir una posición intercambia con la anterior', () => {
    const board = tableroCon(4);
    const plan = planCdkReorder({
      visibleIds: ['l0', 'l1', 'l2', 'l3'],
      previousIndex: 2,
      currentIndex: 1,
      pinnedListId: null,
      searching: false
    });

    expect(plan).toEqual({ listId: 'l2', targetId: 'l1' });
    expect(ordenTrasAplicar(board, plan!)).toEqual(['l0', 'l2', 'l1', 'l3']);
  });

  it('con la fijada en el índice 0 el destino nunca es ella', () => {
    const board = tableroCon(4, 'l0');
    const plan = planCdkReorder({
      visibleIds: ['l0', 'l1', 'l2', 'l3'],
      previousIndex: 3,
      currentIndex: 1,
      pinnedListId: 'l0',
      searching: false
    });

    // La arrastrada cae delante de la segunda, nunca delante de la fijada.
    expect(plan).toEqual({ listId: 'l3', targetId: 'l1' });
    expect(ordenTrasAplicar(board, plan!)).toEqual(['l0', 'l3', 'l1', 'l2']);
  });

  it('la cuenta de la fijada no desalinea los índices', () => {
    // CDK numera sobre las listas que se ven, fijada incluida: al quitar la
    // arrastrada del resto, el destino se busca en la lista que ya no está.
    const board = tableroCon(5, 'l0');
    const visibleIds = ['l0', 'l1', 'l2', 'l3', 'l4'];
    const plan = planCdkReorder({
      visibleIds,
      previousIndex: 4,
      currentIndex: 1,
      pinnedListId: 'l0',
      searching: false
    });

    expect(plan).toEqual({ listId: 'l4', targetId: 'l1' });
    expect(ordenTrasAplicar(board, plan!)).toEqual(['l0', 'l4', 'l1', 'l2', 'l3']);
  });
});

describe('cdk-reorder: el auto-scroll propio', () => {
  const centro = 400;

  it('fuera de la zona de borde no se mueve', () => {
    expect(autoScrollStepFor(centro, 0, 844)).toBe(0);
  });

  it('en el borde inferior scrollea hacia abajo', () => {
    const paso = autoScrollStepFor(830, 0, 844);

    expect(paso).toBeGreaterThan(0);
    expect(paso).toBeLessThanOrEqual(AUTO_SCROLL_MAX_STEP_PX);
    expect(paso).toBeGreaterThanOrEqual(AUTO_SCROLL_MIN_STEP_PX);
  });

  it('en el borde superior scrollea hacia arriba', () => {
    const paso = autoScrollStepFor(12, 0, 844);

    expect(paso).toBeLessThan(0);
    expect(paso).toBeGreaterThanOrEqual(-AUTO_SCROLL_MAX_STEP_PX);
    expect(paso).toBeLessThanOrEqual(-AUTO_SCROLL_MIN_STEP_PX);
  });

  it('cuanto más pegado al borde, más rápido', () => {
    const lejos = autoScrollStepFor(830, 0, 844);
    const pegado = autoScrollStepFor(842, 0, 844);

    expect(pegado).toBeGreaterThan(lejos);
  });

  it('dentro de la zona arranca y justo en el límite ya no', () => {
    expect(autoScrollStepFor(AUTO_SCROLL_EDGE_PX - 1, 0, 844)).toBeLessThan(0);
    expect(autoScrollStepFor(AUTO_SCROLL_EDGE_PX, 0, 844)).toBe(0);
    expect(autoScrollStepFor(844 - AUTO_SCROLL_EDGE_PX, 0, 844)).toBe(0);
    expect(autoScrollStepFor(845 - AUTO_SCROLL_EDGE_PX, 0, 844)).toBeGreaterThan(0);
  });

  it('el paso mínimo arranca lento, como pide el plan (~3 px por fotograma)', () => {
    expect(AUTO_SCROLL_MIN_STEP_PX).toBe(3);
    expect(autoScrollStepFor(AUTO_SCROLL_EDGE_PX - 1, 0, 844)).toBe(AUTO_SCROLL_MIN_STEP_PX * -1);
  });
});

describe('cdk-reorder: la pulsación larga', () => {
  it('el retardo publicado es el de pulsación larga', () => {
    expect(CDK_DRAG_START_DELAY_MS).toBe(400);
  });
});

describe('cdk-reorder: tarjetas altas en la vista de lista', () => {
  it('la previsualización compacta tiene altura acotada', () => {
    expect(LIST_PREVIEW_MAX_HEIGHT_PX).toBe(108);
    // Acotada de verdad: bastante menos que una tarjeta con 40 tareas (~900 px).
    expect(LIST_PREVIEW_MAX_HEIGHT_PX).toBeLessThan(200);
  });

  it('traducir a moveListBefore en columna única mueve al final con destino nulo', () => {
    const board = tableroCon(6);
    const plan = planCdkReorder({
      visibleIds: ['l0', 'l1', 'l2', 'l3', 'l4', 'l5'],
      previousIndex: 1,
      currentIndex: 5,
      pinnedListId: null,
      searching: false
    });

    expect(plan).toEqual({ listId: 'l1', targetId: null });
    expect(ordenTrasAplicar(board, plan!)).toEqual(['l0', 'l2', 'l3', 'l4', 'l5', 'l1']);
  });

  it('columna única con fijada: el destino nunca es la fijada', () => {
    const board = tableroCon(5, 'l0');
    const plan = planCdkReorder({
      visibleIds: ['l0', 'l1', 'l2', 'l3', 'l4'],
      previousIndex: 4,
      currentIndex: 1,
      pinnedListId: 'l0',
      searching: false
    });

    expect(plan).toEqual({ listId: 'l4', targetId: 'l1' });
    expect(ordenTrasAplicar(board, plan!)).toEqual(['l0', 'l4', 'l1', 'l2', 'l3']);
  });

  it('una tarjeta larga que sube un puesto cambia solo con su vecina', () => {
    const board = tableroCon(4);
    const plan = planCdkReorder({
      visibleIds: ['l0', 'l1', 'l2', 'l3'],
      previousIndex: 3,
      currentIndex: 2,
      pinnedListId: null,
      searching: false
    });

    expect(plan).toEqual({ listId: 'l3', targetId: 'l2' });
    expect(ordenTrasAplicar(board, plan!)).toEqual(['l0', 'l1', 'l3', 'l2']);
  });
});

describe('cdk-reorder: el aviso de scroll a CDK', () => {
  it('el contenido baja y las tarjetas suben: el signo es el contrario', () => {
    expect(cdkScrollNotice(9)).toEqual({ top: -9, left: 0 });
    expect(cdkScrollNotice(-4)).toEqual({ top: 4, left: 0 });
  });

  it('sin desplazamiento no hay nada que avisar', () => {
    expect(cdkScrollNotice(0)).toEqual({ top: 0, left: 0 });
  });

  it('el paso lento de arranque ya se avisa (no se queda el hueco atrás)', () => {
    // El mínimo de `autoScrollStepFor` es 3 px por fotograma: con ese paso el aviso
    // sigue siendo útil desde el primer fotograma.
    expect(cdkScrollNotice(AUTO_SCROLL_MIN_STEP_PX).top).toBe(-AUTO_SCROLL_MIN_STEP_PX);
  });
});

describe('cdk-reorder: el toque que cierra el arrastre', () => {
  const ahora = 1_000_000;

  it('durante el arrastre el clic no abre el modal', () => {
    expect(
      shouldOpenCardFocus({ dragActive: true, suppressClickUntil: 0, now: ahora })
    ).toBe(false);
  });

  it('justo después de soltar o cancelar tampoco (el clic lo emite el navegador)', () => {
    const supresion = ahora + CARD_CLICK_SUPPRESS_MS - 10;

    expect(
      shouldOpenCardFocus({ dragActive: false, suppressClickUntil: supresion, now: ahora })
    ).toBe(false);
  });

  it('pasado el plazo el toque siguiente sí abre el modal', () => {
    const expirada = ahora - 1;

    expect(
      shouldOpenCardFocus({ dragActive: false, suppressClickUntil: expirada, now: ahora })
    ).toBe(true);
  });

  it('sin arrastre reciente el clic abre siempre', () => {
    expect(
      shouldOpenCardFocus({ dragActive: false, suppressClickUntil: 0, now: ahora })
    ).toBe(true);
  });
});

describe('cdk-reorder: la red de seguridad del estado', () => {
  it('el plazo de arrastre atascado es finito y generoso', () => {
    expect(CDK_DRAG_SAFETY_TIMEOUT_MS).toBe(30000);
  });
});
