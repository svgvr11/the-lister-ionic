/**
 * Orden de visualización de las listas del tablero.
 *
 * El tablero se dibuja con las listas en un orden aleatorio distinto en cada sesión de
 * la app. Este archivo concentra ese cálculo en funciones puras: sin red, sin estado y
 * sin tocar `position`, para que el orden nunca llegue a guardarse ni provoque escrituras
 * (un reordenado persistido entraría en conflicto con la sincronización, que solo admite
 * adiciones).
 */

/** Lo único que hace falta de una lista para ordenar: su id. */
export interface OrderableList {
  id: string;
}

/** Fuente de aleatoriedad inyectable para poder probar el barajado de forma determinista. */
export type Rng = () => number;

/**
 * Baraja los ids con Fisher-Yates. No muta la entrada y devuelve una permutación:
 * si `rng` devuelve el mismo valor siempre, el resultado es el mismo cada vez.
 */
export function shuffleIds(ids: string[], rng: Rng = Math.random): string[] {
  const result = [...ids];
  for (let index = result.length - 1; index > 0; index--) {
    // El `min` protege de un rng descuidado que devuelva exactamente 1.
    const target = Math.min(index, Math.max(0, Math.floor(rng() * (index + 1))));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

/**
 * Orden de sesión inicial: la lista pinneada fija y el resto barajado (regla del paso 4).
 * Se llama una sola vez por sesión, al llegar el primer tablero con listas.
 */
export function createSessionOrder(
  lists: OrderableList[],
  pinnedId: string | null | undefined,
  rng: Rng = Math.random
): string[] {
  const ids = uniqueIds(lists);
  const pinned = pinnedId && ids.includes(pinnedId) ? [pinnedId] : [];
  const rest = ids.filter((id) => !pinned.includes(id));
  return [...pinned, ...shuffleIds(rest, rng)];
}

/**
 * Mantiene el orden de sesión al día con lo que hay en el tablero, sin volver a barajar:
 * retira las listas que ya no están y añade al final las que llegan nuevas, en el orden
 * en que llegaron. Es idempotente: aplicarlo dos veces con el mismo tablero da lo mismo.
 */
export function reconcileSessionOrder(lists: OrderableList[], sessionOrder: string[]): string[] {
  const ids = uniqueIds(lists);
  const present = new Set(ids);
  const kept = dedupe(sessionOrder).filter((id) => present.has(id));
  const keptIds = new Set(kept);
  return [...kept, ...ids.filter((id) => !keptIds.has(id))];
}

/**
 * Orden en el que se dibujan las listas: primero la pinneada y después el resto en orden
 * de sesión. Si cambia el pin, la nueva sube al principio y la anterior conserva su hueco.
 * Cada lista del tablero aparece exactamente una vez.
 */
export function computeDisplayOrder(
  lists: OrderableList[],
  pinnedId: string | null | undefined,
  sessionOrder: string[]
): { order: string[] } {
  const ids = uniqueIds(lists);
  const present = new Set(ids);
  const order: string[] = [];
  const drawn = new Set<string>();
  const draw = (id: string): void => {
    if (!present.has(id) || drawn.has(id)) return;
    drawn.add(id);
    order.push(id);
  };

  draw(pinnedId ?? '');
  for (const id of sessionOrder) draw(id);
  // Red de seguridad: una lista que el orden de sesión todavía no conoce no se pierde de la rejilla.
  for (const id of ids) draw(id);
  return { order };
}

/** Ids del tablero en el orden en que vienen, sin repetir. */
function uniqueIds(lists: OrderableList[]): string[] {
  return dedupe(lists.map((list) => list.id));
}

/** Conserva la primera aparición de cada id. */
function dedupe(ids: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}
