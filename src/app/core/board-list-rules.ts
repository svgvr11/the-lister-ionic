import type { ChecklistBoard, ChecklistList } from '../models/board.models';
import { MAX_BOARD_LISTS, archiveList } from './list-retention';
import { normalizeListTitle } from './limits';

/**
 * Reglas de las listas dentro del tablero.
 *
 * Este módulo reúne la lógica de negocio que estaba dentro de `BoardPage`, para poder
 * probarla sin montar el componente. Todas las funciones son puras respecto a la
 * interfaz: reciben el tablero (o una lista) y lo modifican o lo leen, pero no tocan la
 * red, el almacenamiento ni el DOM.
 *
 * CONVENCIÓN DE MUTACIÓN: las funciones que cambian el tablero (`syncPinnedList`,
 * `pinList`, `addListToBoard`, `moveListToTrash`, `moveListToArchive`, `reorderLists`)
 * modifican el objeto recibido y devuelven `true` si cambiaron algo. Es lo mismo que
 * hacía la página, y así quien llama sabe si tiene que guardar. Las de lectura
 * (`completedTaskCount`, `listProgressPercent`, …) no modifican nada.
 *
 * El reloj y los identificadores se inyectan donde hacen falta, para que las pruebas
 * puedan fijarlos y el resultado sea determinista.
 */

/** Qué necesita la página para crear una lista: id y fecha nuevos. */
export interface NuevaListaOpciones {
  /** Ubicar la lista al inicio del tablero (y pinneada) en vez de al final. */
  alInicio?: boolean;
  /** Color visual elegido en el formulario. */
  colorVisual?: string;
  /** Generador del id nuevo. Por defecto `crypto.randomUUID`. */
  nuevoId?: () => string;
  /** Reloj. Por defecto `new Date().toISOString()`. */
  ahora?: () => string;
}

/** Lista más cercana al inicio del tablero según el orden estable guardado (`position`). */
function primeraLista(board: ChecklistBoard): ChecklistList | null {
  return [...board.lists].sort((a, b) => a.position - b.position)[0] ?? null;
}

/**
 * Pin que debería tener el tablero: el actual si sigue existiendo, y si no la primera
 * lista por `position`. `position` es el orden estable guardado, así que la elección es
 * la misma en todos los dispositivos y no depende del barajado de cada sesión.
 */
export function resolvePinnedListId(board: ChecklistBoard): string | null {
  const current = board.pinnedListId ?? null;
  const stillInBoard = current !== null && board.lists.some((list) => list.id === current);
  return stillInBoard ? current : (primeraLista(board)?.id ?? null);
}

/**
 * Deja el tablero con exactamente un pin. Devuelve si hubo que corregirlo, para que
 * quien llama sepa que el tablero debe guardarse.
 */
export function syncPinnedList(board: ChecklistBoard): boolean {
  const current = board.pinnedListId ?? null;
  const pinnedListId = resolvePinnedListId(board);
  if (pinnedListId === current) return false;
  board.pinnedListId = pinnedListId;
  return true;
}

/** ¿Está esta lista fijada al tablero? */
export function isPinned(board: ChecklistBoard, listId: string): boolean {
  return (board.pinnedListId ?? null) === listId;
}

/**
 * Fija una lista al inicio del tablero, reemplazando a la que estuviera pinneada.
 * Devuelve si cambió el pin (fijar la misma lista es un no-op).
 */
export function pinList(board: ChecklistBoard, listId: string): boolean {
  if (isPinned(board, listId)) return false;
  board.pinnedListId = listId;
  return true;
}

/** ¿El tablero ya tiene las 50 listas que admite? */
export function isAtListLimit(board: ChecklistBoard): boolean {
  return board.lists.length >= MAX_BOARD_LISTS;
}

/** Cuánto del límite de listas está ocupado, en texto para la interfaz. */
export function listProgress(board: ChecklistBoard): string {
  return `${Math.min(board.lists.length, MAX_BOARD_LISTS) / MAX_BOARD_LISTS * 100}%`;
}

/** Texto del botón de añadir lista: avisa cuando el tablero ya está lleno. */
export function listLimitLabel(board: ChecklistBoard): string {
  return isAtListLimit(board) ? `Límite de ${MAX_BOARD_LISTS} listas alcanzado` : 'Añadir lista';
}

/**
 * Añade una lista al tablero y deja el orden estable (`position`) numerado sin huecos.
 * Devuelve si se añadió: un título que se queda vacío tras normalizarlo (solo espacios,
 * saltos de línea…) o un tablero en el límite no crean nada.
 */
export function addListToBoard(
  board: ChecklistBoard,
  titulo: string,
  opciones: NuevaListaOpciones = {}
): boolean {
  const title = normalizeListTitle(titulo);
  if (!title || isAtListLimit(board)) return false;

  const nuevoId = opciones.nuevoId ?? (() => crypto.randomUUID());
  const ahora = opciones.ahora ?? (() => new Date().toISOString());
  const orderedLists = [...board.lists].sort((a, b) => a.position - b.position);

  const newList: ChecklistList = {
    id: nuevoId(),
    boardId: board.id,
    title,
    visualColor: opciones.colorVisual,
    position: opciones.alInicio ? 0 : orderedLists.length,
    createdAt: ahora(),
    tasks: []
  };

  if (opciones.alInicio) orderedLists.unshift(newList);
  else orderedLists.push(newList);
  orderedLists.forEach((list, index) => (list.position = index));
  board.lists = orderedLists;
  // Una lista creada "al inicio del tablero" también arranca pinneada.
  if (opciones.alInicio) board.pinnedListId = newList.id;
  return true;
}

/** Renumera `position` sin huecos según el orden estable guardado. */
export function reorderLists(board: ChecklistBoard): void {
  [...board.lists]
    .sort((a, b) => a.position - b.position)
    .forEach((list, index) => (list.position = index));
}

/**
 * Mueve una lista al basurero conservando sus tareas y la fecha de descarte. Devuelve si
 * la lista estaba en el tablero.
 *
 * Tras moverla se renumera el orden estable y se reajusta el pin si la descartada era la
 * fijada, igual que hacía la página.
 */
export function moveListToTrash(
  board: ChecklistBoard,
  listId: string,
  ahora: string = new Date().toISOString()
): boolean {
  const list = board.lists.find((item) => item.id === listId);
  if (!list) return false;

  board.lists = board.lists.filter((item) => item.id !== listId);
  board.trashedLists = [
    ...(board.trashedLists ?? []),
    { list: { ...list, tasks: [...list.tasks] }, deletedAt: ahora }
  ];
  reorderLists(board);
  syncPinnedList(board);
  return true;
}

/**
 * Archiva una lista 100% completa: sale del tablero y queda guardada 60 días en el
 * archivo. Si la lista no está completa, no se mueve. Devuelve si se archivó.
 *
 * `archiveList` (de `list-retention.ts`) es quien decide si procede y quien la mueve;
 * aquí solo se renumera el orden y se reajusta el pin, como hacía la página.
 */
export function moveListToArchive(
  board: ChecklistBoard,
  listId: string,
  ahora: string = new Date().toISOString()
): boolean {
  const list = board.lists.find((item) => item.id === listId);
  // `archiveList` guarda la fecha con `new Date(...)`, así que se le pasa la misma en
  // forma de Date: el instante guardado es idéntico al que recibe esta función.
  if (!list || !archiveList(board, list, new Date(ahora))) return false;
  reorderLists(board);
  syncPinnedList(board);
  return true;
}

/** Tareas marcadas de una lista. */
export function completedTaskCount(list: ChecklistList): number {
  return list.tasks.reduce((count, task) => count + Number(task.completed), 0);
}

/** Porcentaje de tareas completadas, redondeado. Una lista vacía está al 0%. */
export function listProgressPercent(list: ChecklistList): number {
  if (!list.tasks.length) return 0;
  return Math.round((completedTaskCount(list) / list.tasks.length) * 100);
}

/**
 * Contador de la tarjeta: "100% Hecho" cuando la lista está terminada (tiene tareas y
 * todas están marcadas) y "completadas/total" en cualquier otro caso.
 */
export function taskCounterLabel(list: ChecklistList): string {
  if (list.tasks.length > 0 && completedTaskCount(list) === list.tasks.length) {
    return '100% Hecho';
  }
  return `${completedTaskCount(list)}/${list.tasks.length}`;
}
