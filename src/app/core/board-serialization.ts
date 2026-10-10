import type { ChecklistBoard } from '../models/board.models';

/**
 * Serialización y versiones del tablero en Supabase.
 *
 * Este módulo NO depende de Angular, de Supabase ni del DOM: son funciones puras que
 * estaban escondidas dentro de `SupabaseBoardRepository` y que aquí se pueden probar sin
 * levantar la aplicación ni la nube.
 */

/** Fila de la tabla `boards` tal como la devuelve Supabase. */
export interface StoredBoard {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  board_data: ChecklistBoard | null;
}

/**
 * Convierte una fila de Supabase en el tablero de la aplicación.
 *
 * Si `board_data` no es un tablero con lista de listas (null, objeto vacío, `lists` que no
 * es array, o directamente un string o un número) se devuelve un tablero vacío con el
 * identificador y las fechas del registro.
 *
 * En la rama con datos se conserva todo lo que traiga `board_data` (los campos que se
 * añadan en el futuro) salvo `id`, `title` y `createdAt`, que siempre manda la fila.
 * La copia es superficial: las listas se comparten con el registro original.
 */
export function deserializeBoard(record: StoredBoard): ChecklistBoard {
  const data = record.board_data;
  if (data && Array.isArray(data.lists)) {
    return {
      ...data,
      id: record.id,
      title: record.title,
      createdAt: record.created_at
    };
  }
  return { id: record.id, title: record.title, createdAt: record.created_at, lists: [] };
}

/**
 * Siguiente versión del tablero: siempre un instante posterior al que se esperaba.
 *
 * El `updated_at` es la versión optimista: al guardar se exige que la fila siga teniendo
 * la versión que se vio al leer. Para no chocar consigo mismo, la nueva versión se calcula
 * como `max(ahora, versión esperada + 1 ms)`, así que siempre queda estrictamente después
 * de la esperada aunque el reloj del dispositivo vaya atrasado.
 *
 * BUG-03: si `expectedVersion` no es una fecha legible, `Date.parse` da NaN y
 * `Math.max(ahora, NaN)` también es NaN, con lo que `new Date(NaN).toISOString()` lanzaba
 * RangeError y el guardado se perdía con un error incomprensible. Regla: ante una versión
 * inválida se usa `now` como base, así que nunca lanza y siempre sale una fecha válida.
 */
export function nextBoardVersion(expectedVersion: string, now: number = Date.now()): string {
  const expected = typeof expectedVersion === 'string' ? Date.parse(expectedVersion) : Number.NaN;
  const base = Number.isFinite(expected) ? Math.max(now, expected + 1) : now;
  return new Date(base).toISOString();
}

/** ¿Son la misma versión? Dos escrituras de la misma fecha son la misma versión. */
export function isSameVersion(left: string, right: string | null): boolean {
  return right !== null && Date.parse(left) === Date.parse(right);
}

/**
 * ¿La versión candidata es más nueva que la que se tiene guardada?
 *
 * Se usa al refrescar para no dar marcha atrás: si la fila remota no es estrictamente más
 * nueva que la última que se vio, el refresco se descarta.
 */
export function isNewerVersion(candidate: string, known: string | null): boolean {
  return known === null || Date.parse(candidate) > Date.parse(known);
}
