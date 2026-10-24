import type { ChecklistBoard, ChecklistList } from '../../../models/board.model';

/**
 * Lógica pura de las listas que salen del tablero: el basurero y el archivo.
 *
 * Ambos sitios hacen lo mismo —contar los días que faltan, colorear el aviso según lo
 * cerca que esté el borrado y purgar lo vencido—, y solo se diferencian en el plazo y
 * en los tramos de color. Por eso el cálculo vive una sola vez aquí, parametrizado por
 * una `RetentionPolicy`, y `core/trash.ts` y `core/archive.ts` son solo las especializaciones
 * de cada uno con sus constantes.
 *
 * Este módulo no importa nada en tiempo de ejecución (solo tipos), para que los scripts
 * de prueba puedan cargarlo con Node.
 */

const MS_PER_DAY = 86_400_000;

/** Niveles de urgencia de la cuenta atrás: el color escala a medida que se acerca el borrado. */
export type RetentionUrgency = 'normal' | 'warning' | 'danger';

/**
 * Plazo y tramos de color de una colección de listas retiradas del tablero.
 * Todo son números enteros de días, y el plazo nunca se escribe suelto en las páginas.
 */
export interface RetentionPolicy {
  /** Días que la lista se conserva antes de eliminarse de forma permanente. */
  readonly retentionDays: number;
  /** Con este número de días restantes o menos, el aviso pasa a rojo. */
  readonly dangerDays: number;
  /** Con este número de días restantes o menos, el aviso pasa a ámbar. */
  readonly warningDays: number;
}

/** Plazo y color del basurero: 7 días, ámbar en los 3 últimos y rojo en el último. */
export const TRASH_POLICY: RetentionPolicy = {
  retentionDays: 7,
  dangerDays: 1,
  warningDays: 3
};

/**
 * Plazo y color del archivo: 60 días. La misma estructura de tres tramos del basurero
 * escalada a 60 días: ámbar en la última cuarta parte (15 días) y rojo en los 3 últimos.
 */
export const ARCHIVE_POLICY: RetentionPolicy = {
  retentionDays: 60,
  dangerDays: 3,
  warningDays: 15
};

/**
 * Límite de listas del tablero. Las del basurero y las del archivo NO cuentan: viven
 * fuera de `board.lists`, así que el límite se comprueba siempre sobre esa colección.
 */
export const MAX_BOARD_LISTS = 50;

/**
 * Interpreta la fecha en que una lista salió del tablero (`deletedAt` / `archivedAt`).
 *
 * BUG-02: el valor viene de un tablero guardado, así que puede estar corrupto: cadena
 * vacía, texto que no es fecha, `null`, un número, un objeto... Con cualquiera de esas
 * cosas `Date.parse` da NaN, y con NaN todas las comparaciones salen false. Eso hacía que
 * la purga tratara la entrada como vencida y la BORRARA, y que el contador pintara "NaN días".
 *
 * Regla: una fecha inválida NUNCA purga. Se conserva la entrada y se trata como recién
 * salida del tablero, es decir, con el plazo completo por delante. Para eso se devuelve
 * `now`, que es el instante de referencia del cálculo. Centralizarlo aquí es lo que
 * garantiza que la purga y el contador decidan siempre lo mismo.
 *
 * Se admite solo texto con contenido y parseable. Ojo con `new Date(null)` y
 * `new Date(0)`: dan el 1 de enero de 1970, que es una fecha VÁLIDA (aunque absurda), y
 * eso sí debe purgarse con normalidad. Por eso se exige `typeof === 'string'` antes de
 * parsear, en lugar de dejar que el constructor convierta el valor.
 */
function parseStartedAt(startedAt: string, now: Date): Date {
  if (typeof startedAt !== 'string') return now;
  const trimmed = startedAt.trim();
  if (!trimmed) return now;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed) : now;
}

/** Fecha en la que una lista de la colección se elimina definitivamente. */
export function retentionDeadline(startedAt: string, policy: RetentionPolicy, now: Date = new Date()): Date {
  return new Date(parseStartedAt(startedAt, now).getTime() + policy.retentionDays * MS_PER_DAY);
}

/**
 * Días que faltan para el borrado definitivo. Se redondea hacia arriba para que
 * "1 día" cubra las últimas 24 horas completas, y 0 (o menos) significa vencida.
 */
export function retentionDaysLeft(
  startedAt: string,
  policy: RetentionPolicy,
  now: Date = new Date()
): number {
  return Math.ceil((retentionDeadline(startedAt, policy, now).getTime() - now.getTime()) / MS_PER_DAY);
}

/**
 * Urgencia según lo cerca que esté el borrado. Con el último tramo la lista además se
 * tiñe de rojo, por eso ese nivel es aparte.
 */
export function retentionUrgency(days: number, policy: RetentionPolicy): RetentionUrgency {
  if (days <= policy.dangerDays) return 'danger';
  if (days <= policy.warningDays) return 'warning';
  return 'normal';
}

/** Etiqueta de la cuenta atrás que se muestra en el badge de cada lista de la colección. */
export function countdownLabel(days: number): string {
  if (days <= 1) return `${Math.max(days, 1)} día (Último día)`;
  return `${days} días`;
}

/**
 * Descarta de una colección las entradas que ya cumplieron el plazo, sin tocar ninguna
 * otra propiedad del tablero. Devuelve si se eliminó alguna lista, para avisar que hay
 * que guardar.
 */
export function purgeExpiredEntries<T>(
  entries: T[],
  startedAtOf: (entry: T) => string,
  policy: RetentionPolicy,
  now: Date = new Date()
): { alive: T[]; purged: boolean } {
  const alive = entries.filter((entry) => retentionDaysLeft(startedAtOf(entry), policy, now) > 0);
  return { alive, purged: alive.length !== entries.length };
}

/**
 * Normaliza el basurero de un tablero y descarta lo que ya cumplió los 7 días.
 * Devuelve también si se eliminó alguna lista, para avisar que hay que guardar.
 * Solo toca `trashedLists`: el archivo y las listas del tablero no se ven afectados.
 */
export function purgeExpiredLists(board: ChecklistBoard, now: Date = new Date()): boolean {
  const current = board.trashedLists;
  const { alive, purged } = purgeExpiredEntries(
    current ?? [],
    (entry) => entry.deletedAt,
    TRASH_POLICY,
    now
  );
  // Un tablero que nunca tuvo basurero no gana el campo por el simple hecho de abrirlo:
  // se escribe la colección solo si ya existía o si hay algo que purgar.
  if (current !== undefined || purged) board.trashedLists = alive;
  return purged;
}

/**
 * Normaliza el archivo de un tablero y descarta lo que ya cumplió los 60 días.
 * Devuelve también si se eliminó alguna lista, para avisar que hay que guardar.
 * Solo toca `archivedLists`: el basurero y las listas del tablero no se ven afectados.
 */
export function purgeExpiredArchivedLists(board: ChecklistBoard, now: Date = new Date()): boolean {
  const current = board.archivedLists;
  const { alive, purged } = purgeExpiredEntries(
    current ?? [],
    (entry) => entry.archivedAt,
    ARCHIVE_POLICY,
    now
  );
  // Igual que en el basurero: si la lista nunca existió, no se crea vacía al abrir.
  if (current !== undefined || purged) board.archivedLists = alive;
  return purged;
}

/** Una lista está completa cuando tiene tareas y todas están marcadas. */
export function isListComplete(list: ChecklistList): boolean {
  return list.tasks.length > 0 && list.tasks.every((task) => task.completed);
}

/**
 * Solo se archivan listas 100% completas: es el trabajo terminado lo que se guarda en el
 * archivo. Una lista incompleta no cumple la condición y no se archiva.
 * Devuelve si la lista se archivó.
 */
export function archiveList(board: ChecklistBoard, list: ChecklistList, now: Date = new Date()): boolean {
  if (!isListComplete(list)) return false;
  board.lists = board.lists.filter((item) => item.id !== list.id);
  board.archivedLists = [
    ...(board.archivedLists ?? []),
    { list: { ...list, tasks: [...list.tasks] }, archivedAt: now.toISOString() }
  ];
  return true;
}

/**
 * Devuelve una lista al final del tablero conservando sus tareas y su estado.
 * «Al final» es la última posición del orden de dibujo: `position` es el orden estable
 * guardado, así que la restauración entra detrás de todas en cualquier dispositivo.
 *
 * Devuelve false si el tablero ya tiene el máximo de listas; en ese caso el tablero no se
 * toca y la lista se queda donde estaba, para que no se pierda.
 */
export function restoreListToBoard(board: ChecklistBoard, list: ChecklistList): boolean {
  if (board.lists.length >= MAX_BOARD_LISTS) return false;
  board.lists = [...board.lists, { ...list, position: board.lists.length }];
  return true;
}

/** Aviso que se muestra al pulsar "Restaurar lista" con el tablero ya en el límite. */
export function listLimitRestoreMessage(): string {
  return `Tu tablero ya tiene ${MAX_BOARD_LISTS} listas. Elimina o archiva una para poder restaurar esta.`;
}