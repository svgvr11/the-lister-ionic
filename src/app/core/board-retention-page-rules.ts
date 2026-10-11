import { restoreListToBoard } from './list-retention';
import type {
  ChecklistArchivedList,
  ChecklistBoard,
  ChecklistList,
  ChecklistTrashedList
} from '../models/board.models';

/**
 * Reglas compartidas del Basurero y del Archivo.
 *
 * Las dos pantallas hacían lo mismo con su colección: ordenar por fecha, restaurar
 * respetando el límite de 50 listas, vaciar, eliminar una y calcular la cuenta atrás.
 * Aquí está esa lógica, sin Angular ni DOM, para poder probarla sin montarlas.
 *
 * Mutan el tablero recibido y devuelven si cambiaron algo, igual que las reglas del
 * tablero (`board-list-rules.ts`).
 */

/** Entrada genérica de las colecciones con plazo de conservación. */
interface EntradaRetencion {
  list: ChecklistList;
}

/**
 * Ordena de la más reciente a la más antigua.
 *
 * `fecha` dice de dónde sale la fecha de cada entrada (`deletedAt` o `archivedAt`),
 * porque las dos colecciones la guardan con nombres distintos.
 *
 * OJO: si una fecha no es interpretable, `new Date(...)` da NaN y el criterio de orden
 * devuelve NaN, así que esas entradas se quedan donde estaba el `sort`. No se cambia: es
 * el comportamiento actual y las fechas inválidas ya están protegidas en BUG-02.
 */
export function ordenarEntradasPorFecha<T>(
  entradas: readonly T[],
  fecha: (entrada: T) => string
): T[] {
  return [...entradas].sort((a, b) => new Date(fecha(b)).getTime() - new Date(fecha(a)).getTime());
}

/**
 * Restaura una entrada al final del tablero y la quita de su colección.
 *
 * Devuelve `false` si el tablero está en el límite de 50 listas: en ese caso la entrada se
 * queda donde está (no se pierde nada) y quien llama muestra el aviso.
 */
function restaurar<T extends EntradaRetencion>(
  board: ChecklistBoard,
  entrada: T,
  actuales: T[] | undefined,
  escribir: (entradas: T[]) => void,
  fecha: (entrada: T) => string
): boolean {
  if (!restoreListToBoard(board, entrada.list)) return false;
  // Se filtra sobre la copia ordenada, que es la que se estaba mostrando.
  escribir(
    ordenarEntradasPorFecha(actuales ?? [], fecha).filter((item) => item.list.id !== entrada.list.id)
  );
  return true;
}

/** Restaura una lista descartada al tablero y la quita del basurero. */
export function restaurarDesdeBasurero(board: ChecklistBoard, entrada: ChecklistTrashedList): boolean {
  return restaurar(
    board,
    entrada,
    board.trashedLists,
    (entradas) => {
      board.trashedLists = entradas;
    },
    (item) => item.deletedAt
  );
}

/** Restaura una lista archivada al tablero y la quita del archivo. */
export function restaurarDesdeArchivo(board: ChecklistBoard, entrada: ChecklistArchivedList): boolean {
  return restaurar(
    board,
    entrada,
    board.archivedLists,
    (entradas) => {
      board.archivedLists = entradas;
    },
    (item) => item.archivedAt
  );
}

/** Vacía el basurero. */
export function vaciarBasurero(board: ChecklistBoard): void {
  board.trashedLists = [];
}

/** Vacía el archivo. */
export function vaciarArchivo(board: ChecklistBoard): void {
  board.archivedLists = [];
}

/** Elimina una entrada concreta del basurero (borrado definitivo). */
export function eliminarDelBasurero(board: ChecklistBoard, entrada: ChecklistTrashedList): void {
  const actuales = ordenarEntradasPorFecha(board.trashedLists ?? [], (item) => item.deletedAt);
  board.trashedLists = actuales.filter((item) => item.list.id !== entrada.list.id);
}

/** Elimina una entrada concreta del archivo (borrado definitivo). */
export function eliminarDelArchivo(board: ChecklistBoard, entrada: ChecklistArchivedList): void {
  const actuales = ordenarEntradasPorFecha(board.archivedLists ?? [], (item) => item.archivedAt);
  board.archivedLists = actuales.filter((item) => item.list.id !== entrada.list.id);
}

/**
 * Días que se muestran en el badge. Nunca baja de 1: la lista se purga justo al llegar a
 * 0, así que un 0 solo podría salir de una fecha inválida y "0 días" confunde.
 */
export function diasRestantesSeguro(dias: number): number {
  return Math.max(dias, 1);
}

/** Clase CSS del badge según la urgencia: gris → ámbar → rojo. */
export function claseUrgencia(urgencia: 'normal' | 'warning' | 'danger'): string {
  return `countdown-${urgencia}`;
}

/** ¿La tarjeta entera se tiñe de roja? Solo en el tramo final. */
export function esUrgente(urgencia: 'normal' | 'warning' | 'danger'): boolean {
  return urgencia === 'danger';
}

/** Acción que el diálogo del basurero está a punto de ejecutar. */
export type AccionBasurero =
  /** Vaciar el basurero entero. */
  | { kind: 'empty'; cantidad: number }
  /** Eliminar una lista para siempre. */
  | { kind: 'purge' };

/**
 * Textos del diálogo de confirmación del basurero. Se resuelven aquí para no repetir la
 * condición en la plantilla: vaciar el basurero y eliminar una lista son cosas distintas.
 */
export function textosAccionBasurero(accion: AccionBasurero): {
  title: string;
  message: string;
  listTitle: string;
  actionLabel: string;
} {
  if (accion.kind === 'empty') {
    return {
      title: '¿Vaciar el basurero?',
      // El número sale de lo que se está mostrando, no de un cálculo aparte.
      message: `Se eliminarán las ${accion.cantidad} listas del basurero con todas sus tareas. Esta acción no se puede deshacer.`,
      listTitle: '',
      actionLabel: 'Vaciar basurero'
    };
  }
  return {
    title: '¿Eliminar permanentemente?',
    message:
      'Esta lista y todas sus tareas se eliminarán de forma definitiva. Esta acción no se puede deshacer.',
    listTitle: '',
    actionLabel: 'Eliminar permanentemente'
  };
}
