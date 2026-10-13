import type { ChecklistBoard, ChecklistList } from '../models/board.models';
import { MAX_BOARD_LISTS, archiveList } from './list-retention';
import { normalizeListTitle } from './limits';
import { touchList } from './list-updated-at';

/**
 * Reglas de las listas dentro del tablero.
 *
 * Este módulo reúne la lógica de negocio que estaba dentro de `BoardPage`, para poder
 * probarla sin montar el componente. Todas las funciones son puras respecto a la
 * interfaz: reciben el tablero (o una lista) y lo modifican o lo leen, pero no tocan la
 * red, el almacenamiento ni el DOM.
 *
 * CONVENCIÓN DE MUTACIÓN: las funciones que cambian el tablero (`syncPinnedList`,
 * `pinList`, `addListToBoard`, `moveListToTrash`, `moveListToArchive`, `moveListBefore`,
 * `moveListByOffset`, `reorderLists`) modifican el objeto recibido y devuelven `true` si
 * cambiaron algo. Es lo mismo que hacía la página, y así quien llama sabe si tiene que
 * guardar. Las de lectura (`completedTaskCount`, `listProgressPercent`, `orderedLists`, …)
 * no modifican nada.
 *
 * De esas acciones, crear una lista (`addListToBoard`) y editar su título (`editListTitle`)
 * son modificaciones de la lista afectada, así que fijan su `updatedAt` con `touchList`.
 * Las demás no: fijar o desfijar, renumerar posiciones, mover al basurero o al archivo y
 * las normalizaciones no cambian la fecha de última actualización.
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
 * la misma en todos los dispositivos.
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
 *
 * Crear una lista es una modificación de esa lista: arranca con `updatedAt` igual a su
 * `createdAt`. El resto de las listas solo se renumeran, así que no se tocan sus fechas.
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
  // El final del tablero es el del orden de dibujo (la fijada primera, luego `position`),
  // que es también el orden en el que queda el array.
  const ordered = orderedLists(board);
  // Una sola fecha por acción: la del alta de la lista.
  const creada = ahora();

  const newList: ChecklistList = {
    id: nuevoId(),
    boardId: board.id,
    title,
    visualColor: opciones.colorVisual,
    position: opciones.alInicio ? 0 : ordered.length,
    createdAt: creada,
    updatedAt: creada,
    tasks: []
  };

  if (opciones.alInicio) ordered.unshift(newList);
  else ordered.push(newList);
  ordered.forEach((list, index) => (list.position = index));
  board.lists = ordered;
  // Una lista creada "al inicio del tablero" también arranca pinneada.
  if (opciones.alInicio) board.pinnedListId = newList.id;
  return true;
}

/**
 * Aplica el título editado de una lista y fija su fecha de última modificación.
 * Devuelve `false` si el título se queda vacío tras normalizarlo (entonces no hay nada que
 * guardar y quien llama cancela la edición).
 */
export function editListTitle(
  list: ChecklistList,
  titulo: string,
  ahora: string = new Date().toISOString()
): boolean {
  const title = normalizeListTitle(titulo);
  if (!title) return false;
  list.title = title;
  touchList(list, ahora);
  return true;
}

/**
 * Aplica un orden de dibujo al tablero: reescribe `position` sin huecos Y deja el array
 * de listas en ese mismo orden (igual que hace `addListToBoard`). Devuelve si algo cambió
 * de verdad, para que quien llame sepa si tiene que guardar: reordenar sobre el orden que
 * ya se está dibujando no escribe nada.
 */
function applyDisplayOrder(board: ChecklistBoard, order: ChecklistList[]): boolean {
  const previous = orderedLists(board).map((list) => list.id);
  order.forEach((list, index) => (list.position = index));
  board.lists = order;
  const reordered = previous.length !== order.length
    || previous.some((id, index) => id !== order[index].id);
  const renumbered = order.some((list, index) => list.position !== index);
  return reordered || renumbered;
}

/**
 * Orden en el que se dibujan las listas: la fijada primero y el resto por `position`.
 *
 * `position` es el orden estable guardado, así que este orden es el mismo en todos los
 * dispositivos: no hay nada aleatorio ni de sesión. Si hay `position` repetida (un tablero
 * viejo o una fusión rara) el `sort` es estable y las empatadas conservan el orden del
 * array, que es el que se guarda, así que nunca se duda de cuál va delante.
 */
export function orderedLists(board: ChecklistBoard): ChecklistList[] {
  const pinnedId = board.pinnedListId ?? null;
  const pinned = pinnedId === null ? [] : board.lists.filter((list) => list.id === pinnedId);
  const rest = board.lists.filter((list) => list.id !== pinnedId);
  return [...pinned, ...rest.sort((a, b) => a.position - b.position)];
}

/**
 * Mueve una lista delante de otra (o al final del tablero si `targetId` es `null`).
 *
 * El destino se mide sobre el orden de dibujo, no sobre la fila que se ve en pantalla: con
 * el maquetado masonry de tres columnas el orden lógico no se lee de izquierda a derecha,
 * así que «delante de» significa «antes en el orden de dibujo». Devuelve si el tablero
 * cambió (entonces hay que guardar); estos casos no mueven nada:
 *
 *  - la lista fijada: no se arrastra ni se mueve con el teclado.
 *  - la lista no está en el tablero, o el destino no existe.
 *  - soltar la lista sobre sí misma.
 *
 * Nada se coloca por delante de la fijada: un destino que caiga antes se corrige al hueco
 * siguiente, justo detrás de ella. Renumerar posiciones no es una modificación de la lista,
 * así que no toca ningún `updatedAt`.
 */
export function moveListBefore(
  board: ChecklistBoard,
  listId: string,
  targetId: string | null
): boolean {
  if (isPinned(board, listId)) return false;
  const order = orderedLists(board);
  if (!order.some((list) => list.id === listId)) return false;
  // El destino se mide sobre lo que queda: quitar la arrastrada antes de buscar sitio es lo
  // que hace que soltarla sobre sí misma (o en su propio hueco) no la desplace.
  const remaining = order.filter((list) => list.id !== listId);
  let target = remaining.length;
  if (targetId !== null) {
    const index = remaining.findIndex((list) => list.id === targetId);
    // La arrastrada ya no está en `remaining`: soltarla sobre sí misma no encuentra destino.
    if (index < 0) return false;
    target = index;
  }
  if (board.pinnedListId && remaining.some((list) => list.id === board.pinnedListId)) {
    target = Math.max(target, 1);
  }
  return applyDisplayOrder(board, [
    ...remaining.slice(0, target),
    order.find((list) => list.id === listId)!,
    ...remaining.slice(target)
  ]);
}

/**
 * Mueve una lista una posición arriba o abajo en el orden de dibujo (teclado). Devuelve si
 * el tablero cambió. La lista fijada no se mueve y tampoco se puede pasar por delante de
 * ella, así que un desplazamiento que choque con el inicio del tablero no hace nada.
 */
export function moveListByOffset(board: ChecklistBoard, listId: string, offset: number): boolean {
  if (isPinned(board, listId) || offset === 0) return false;
  const order = orderedLists(board);
  const from = order.findIndex((list) => list.id === listId);
  if (from < 0) return false;
  const firstMovable = board.pinnedListId ? 1 : 0;
  const to = from + offset;
  if (to < firstMovable || to >= order.length) return false;
  const next = [...order];
  next.splice(to, 0, ...next.splice(from, 1));
  return applyDisplayOrder(board, next);
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
