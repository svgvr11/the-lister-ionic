/**
 * Lo que hace falta para distinguir y anunciar el arrastre de LISTAS.
 *
 * Las listas se arrastran desde el handle de su cabecera (solo en la vista de lista de
 * escritorio web) y las tareas desde su propio handle. Los dos arrastres conviven en la
 * misma pantalla, así que aquí vive lo que los mantiene separados sin que uno moleste al
 * otro:
 *
 *  - El estado propio de la página (`draggedListId`) dice si hay una lista en vuelo.
 *  - El `dataTransfer` lleva el tipo `LIST_DRAG_TYPE` (y el texto plano con el prefijo
 *    `list:`), igual que las tareas llevan `task:`. Al soltar se comprueba el tipo, así que
 *    un arrastre que no ha salido de aquí (un archivo, un texto de otra web) no mueve nada.
 *
 * Nada de esto toca el tablero ni el DOM: son datos. Las funciones que reordenan viven en
 * `board-list-rules.ts`.
 */

/** Tipo propio con el que viaja el id de la lista que se está arrastrando. */
export const LIST_DRAG_TYPE = 'application/x-the-lister-list';

/** Prefijo del texto plano, para que el arrastre también se identifique fuera de la app. */
export const LIST_DRAG_TEXT_PREFIX = 'list:';

/** Lo único del `dataTransfer` que se necesita: leer y escribir un tipo. */
export interface DragPayloadReader {
  getData: (type: string) => string;
  setData: (type: string, value: string) => void;
}

/** Deja en el `dataTransfer` el id de la lista arrastrada, en sus dos formatos. */
export function setListDragPayload(dataTransfer: DragPayloadReader | null | undefined, listId: string): void {
  if (!dataTransfer) return;
  dataTransfer.setData(LIST_DRAG_TYPE, listId);
  dataTransfer.setData('text/plain', `${LIST_DRAG_TEXT_PREFIX}${listId}`);
}

/**
 * Id de la lista que lleva el `dataTransfer`, o `null` si no es un arrastre de lista.
 *
 * Se acepta el tipo propio o el texto plano con el prefijo: el primero es el que está
 * garantizado, el segundo cubre los navegadores que vacían los tipos propios. Cualquier
 * otra cosa (una tarea, un archivo, texto suelto) devuelve `null` y quien llama no hace
 * nada.
 */
export function readListDragPayload(dataTransfer: DragPayloadReader | null | undefined): string | null {
  if (!dataTransfer) return null;
  const typed = dataTransfer.getData(LIST_DRAG_TYPE).trim();
  if (typed) return typed;
  const plain = dataTransfer.getData('text/plain').trim();
  return plain.startsWith(LIST_DRAG_TEXT_PREFIX)
    ? plain.slice(LIST_DRAG_TEXT_PREFIX.length) || null
    : null;
}

/**
 * Teclas que mueven una lista con el teclado, y cuánto: Alt + flecha (arriba/izquierda
 * suben una posición, abajo/derecha la bajan). Sin Alt, o con otra tecla, devuelve 0 y
 * quien llama deja pasar el evento (las flechas solas siguen moviendo el scroll).
 */
export function listDragKeyOffset(event: { altKey: boolean; key: string }): number {
  if (!event.altKey) return 0;
  switch (event.key) {
    case 'ArrowUp':
    case 'ArrowLeft':
      return -1;
    case 'ArrowDown':
    case 'ArrowRight':
      return 1;
    default:
      return 0;
  }
}

/**
 *Texto que se anuncia en la región `aria-live` al mover una lista con el teclado. La
 posición es 1-based porque es la que se lee en pantalla ("posición 2 de 5").
 */
export function listMoveAnnouncement(title: string, index: number, total: number): string {
  return `Lista ${title} movida a la posición ${index + 1} de ${total}`;
}

/** Aviso de que la lista ya estaba en el borde y no se ha movido. */
export function listMoveBlockedAnnouncement(title: string, index: number, total: number): string {
  return `La lista ${title} ya está en la posición ${index + 1} de ${total}`;
}
