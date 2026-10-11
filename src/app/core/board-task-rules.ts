import type { ChecklistBoard, ChecklistList, ChecklistTask } from '../models/board.models';
import { touchList } from './list-updated-at';

/**
 * Reglas de las tareas dentro de una lista.
 *
 * Mismo enfoque que `board-list-rules.ts`: la lógica de negocio que estaba en `BoardPage`,
 * reunida aquí para poder probarla sin montar el componente. Nada de Angular ni de DOM.
 *
 * CONVENCIÓN DE MUTACIÓN: las funciones que cambian una lista (`addTaskToList`,
 * `toggleTask`, `deleteTask`, `moveTask…`, `reorderTasks`) modifican el objeto recibido y
 * devuelven `true` si cambiaron algo. Las de lectura (`pendingTasks`, `completedTasks`,
 * `getHighlightedSegments`) no modifican nada.
 *
 * Cada una de esas acciones de usuario fija además la fecha de última modificación de la lista
 * (`updatedAt`) con `touchList`. El reloj se inyecta donde hace falta —igual que en las reglas
 * de listas— y las que mueven una tarea entre dos listas reciben la fecha ya creada por quien
 * llama, para que origen y destino compartan el mismo instante.
 *
 * El reloj y los identificadores se inyectan donde hacen falta, igual que en las reglas
 * de listas.
 */

/** Qué necesita la página para crear una tarea: id y fecha nuevos. */
export interface NuevaTareaOpciones {
  nuevoId?: () => string;
  ahora?: () => string;
}

/** Cuántas tareas completadas se muestran antes del "ver todas". */
export const COMPLETED_PREVIEW_LIMIT = 2;

/** Tareas sin marcar, ordenadas por su posición. */
export function pendingTasks(list: ChecklistList): ChecklistTask[] {
  return list.tasks.filter((task) => !task.completed).sort((a, b) => a.position - b.position);
}

/** Tareas marcadas, ordenadas por su posición. */
export function completedTasks(list: ChecklistList): ChecklistTask[] {
  return list.tasks.filter((task) => task.completed).sort((a, b) => a.position - b.position);
}

/**
 * Tareas completadas que se ven: todas si la lista está desplegada o hay pocas, y solo
 * las primeras `limite` en el resto de los casos.
 */
export function visibleCompletedTasks(
  list: ChecklistList,
  desplegada: boolean,
  limite: number = COMPLETED_PREVIEW_LIMIT
): ChecklistTask[] {
  const completed = completedTasks(list);
  if (desplegada || completed.length <= limite) return completed;
  return completed.slice(0, limite);
}

/** Cuántas completadas quedan ocultas tras la vista previa. */
export function hiddenCompletedCount(
  list: ChecklistList,
  limite: number = COMPLETED_PREVIEW_LIMIT
): number {
  return Math.max(0, completedTasks(list).length - limite);
}

/** ¿Hace falta el botón de "ver todas" las completadas? */
export function shouldShowCompletedToggle(
  list: ChecklistList,
  limite: number = COMPLETED_PREVIEW_LIMIT
): boolean {
  return completedTasks(list).length > limite;
}

/**
 * Añade una tarea al final de la lista y devuelve la creada, o `null` si el texto se
 * queda vacío (tras recortar espacios en los bordes). La posición es la siguiente a la
 * más alta que haya, así que poner una a mano no descuadra el orden.
 *
 * Añadir una tarea es una modificación de la lista: la fecha que se crea para la tarea
 * es la que queda también como `updatedAt` de la lista.
 */
export function addTaskToList(
  list: ChecklistList,
  texto: string,
  opciones: NuevaTareaOpciones = {}
): ChecklistTask | null {
  const text = texto.trim();
  if (!text) return null;

  const nuevoId = opciones.nuevoId ?? (() => crypto.randomUUID());
  const ahora = opciones.ahora ?? (() => new Date().toISOString());
  const maxPosition = list.tasks.reduce((max, task) => Math.max(max, task.position), -1);
  // Una sola fecha por acción: la de la tarea nueva y la de la lista son la misma.
  const creada = ahora();

  const task: ChecklistTask = {
    id: nuevoId(),
    listId: list.id,
    text,
    completed: false,
    position: maxPosition + 1,
    createdAt: creada
  };
  list.tasks.push(task);
  touchList(list, creada);
  return task;
}

/**
 * Marca o desmarca una tarea y reordena la lista para que las completadas queden al
 * final. Devuelve si la tarea estaba en la lista.
 */
export function toggleTask(list: ChecklistList, taskId: string, ahora?: string): boolean {
  const task = list.tasks.find((item) => item.id === taskId);
  if (!task) return false;
  task.completed = !task.completed;
  reorderTasks(list);
  touchList(list, ahora ?? new Date().toISOString());
  return true;
}

/**
 * Borra una tarea y reordena. Devuelve si la tarea estaba en la lista.
 */
export function deleteTask(list: ChecklistList, taskId: string, ahora?: string): boolean {
  const antes = list.tasks.length;
  list.tasks = list.tasks.filter((task) => task.id !== taskId);
  const borrada = list.tasks.length !== antes;
  reorderTasks(list);
  if (borrada) touchList(list, ahora ?? new Date().toISOString());
  return borrada;
}

/**
 * Reordena una lista dejando las pendientes primero (ordenadas entre sí) y las
 * completadas después (también ordenadas), renumerando las posiciones.
 */
export function reorderTasks(list: ChecklistList): void {
  [...pendingTasks(list), ...completedTasks(list)].forEach((task, index) => (task.position = index));
}

/** Renumera las posiciones siguiendo el orden del array, sin separar por estado. */
export function setTaskPositions(list: ChecklistList): void {
  list.tasks.forEach((task, index) => (task.position = index));
}

/**
 * Aplica el texto editado de una tarea. Solo se recortan los bordes: a diferencia del
 * título de una lista, aquí no se colapsan los espacios internos ni se recorta la
 * longitud, y así se ha comportado siempre. Devuelve si se aplicó (`false` si el texto
 * queda vacío, que es el caso en el que hay que cancelar la edición).
 *
 * Editar el texto es una modificación de la lista que contiene la tarea, así que la lista
 * va como primer argumento y es la que recibe el `updatedAt`.
 */
export function editTaskText(list: ChecklistList, task: ChecklistTask, texto: string, ahora?: string): boolean {
  const text = texto.trim();
  if (!text) return false;
  task.text = text;
  touchList(list, ahora ?? new Date().toISOString());
  return true;
}

/** Referencia mínima de la tarea que se está arrastrando. */
export interface TareaArrastrada {
  listId: string;
  taskId: string;
}

/** Encuentra una lista del tablero por id. */
function listaPorId(board: ChecklistBoard, listId: string): ChecklistList | undefined {
  return board.lists.find((list) => list.id === listId);
}

/**
 * Deja las tareas de una lista agrupadas (pendientes y después completadas), que es el
 * punto de partida de ambos arrastres: así el resultado no depende de en qué estado
 * estaba cada tarea.
 */
function agruparTareas(list: ChecklistList): void {
  list.tasks = [...pendingTasks(list), ...completedTasks(list)];
}

/** Saca la tarea arrastrada de su lista y la devuelve, o `null` si ya no está. */
function sacarTareaArrastrada(sourceList: ChecklistList, taskId: string): ChecklistTask | null {
  const sourceIndex = sourceList.tasks.findIndex((task) => task.id === taskId);
  if (sourceIndex < 0) return null;
  return sourceList.tasks.splice(sourceIndex, 1)[0] ?? null;
}

/**
 * Suelta una tarea sobre otra tarea concreta: se inserta justo antes que esa. Devuelve
 * si se movió. Suelta la tarea sobre sí misma es un no-op.
 *
 * Tanto reordenar dentro de una lista como mover la tarea a otra lista son modificaciones:
 * el `updatedAt` se fija en el origen y, si es otra lista, también en el destino, con la
 * misma fecha en los dos.
 */
export function dropTask(
  board: ChecklistBoard,
  arrastrada: TareaArrastrada,
  listIdDestino: string,
  taskIdDestino: string,
  ahora?: string
): boolean {
  if (arrastrada.taskId === taskIdDestino) return false;
  const sourceList = listaPorId(board, arrastrada.listId);
  const targetList = listaPorId(board, listIdDestino);
  if (!sourceList || !targetList) return false;

  agruparTareas(sourceList);
  if (sourceList !== targetList) agruparTareas(targetList);
  const moved = sacarTareaArrastrada(sourceList, arrastrada.taskId);
  if (!moved) return false;

  const targetIndex = targetList.tasks.findIndex((task) => task.id === taskIdDestino);
  // Con índice negativo (no se encuentra) la tarea cae al principio de la lista.
  targetList.tasks.splice(Math.max(0, targetIndex), 0, moved);

  setTaskPositions(sourceList);
  if (sourceList !== targetList) setTaskPositions(targetList);
  // La fecha se crea UNA sola vez por acción, aunque acabe en dos listas.
  const modificada = ahora ?? new Date().toISOString();
  touchList(sourceList, modificada);
  if (sourceList !== targetList) touchList(targetList, modificada);
  return true;
}

/**
 * Suelta una tarea en una lista (no sobre otra tarea): va al final de esa lista.
 * Devuelve si se movió.
 */
export function dropTaskInList(
  board: ChecklistBoard,
  arrastrada: TareaArrastrada,
  listIdDestino: string,
  ahora?: string
): boolean {
  const sourceList = listaPorId(board, arrastrada.listId);
  const targetList = listaPorId(board, listIdDestino);
  if (!sourceList || !targetList) return false;

  agruparTareas(sourceList);
  if (sourceList !== targetList) agruparTareas(targetList);
  const moved = sacarTareaArrastrada(sourceList, arrastrada.taskId);
  if (!moved) return false;

  targetList.tasks.push(moved);
  setTaskPositions(sourceList);
  if (sourceList !== targetList) setTaskPositions(targetList);
  // La fecha se crea UNA sola vez por acción, aunque acabe en dos listas.
  const modificada = ahora ?? new Date().toISOString();
  touchList(sourceList, modificada);
  if (sourceList !== targetList) touchList(targetList, modificada);
  return true;
}

/** Trozo de título para el resaltado de la búsqueda. */
export interface HighlightSegment {
  text: string;
  highlight: boolean;
}

/**
 * Parte un título en trozos, marcando los que coinciden con la búsqueda.
 *
 * La comparación es sin distinguir mayúsculas, pero el texto devuelto es siempre el
 * original (con sus mayúsculas). Si la búsqueda está vacía o son solo espacios, el título
 * entero vuelve sin resaltar.
 *
 * OJO: se recorta con `query.length`, que cuenta unidades UTF-16, mientras que la
 * búsqueda se hace sobre el título pasado a minúsculas. Con caracteres cuyo minúscula
 * tiene otra longitud (la İ turca, por ejemplo) los índices se desalinean y el resalte
 * cae en el sitio equivocado. No se cambia aquí; queda anotado en las pruebas.
 */
export function getHighlightedSegments(title: string, query: string): HighlightSegment[] {
  if (!query.trim()) return [{ text: title, highlight: false }];
  const busqueda = query.toLowerCase();
  const lower = title.toLowerCase();
  const segments: HighlightSegment[] = [];
  let lastIdx = 0;
  let idx = lower.indexOf(busqueda, lastIdx);
  while (idx !== -1) {
    if (idx > lastIdx) {
      segments.push({ text: title.slice(lastIdx, idx), highlight: false });
    }
    segments.push({
      text: title.slice(idx, idx + query.length),
      highlight: true
    });
    lastIdx = idx + query.length;
    idx = lower.indexOf(busqueda, lastIdx);
  }
  if (lastIdx < title.length) {
    segments.push({ text: title.slice(lastIdx), highlight: false });
  }
  return segments;
}
