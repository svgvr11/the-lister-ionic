import { beforeEach, describe, expect, it } from 'vitest';
import type { ChecklistBoard, ChecklistList, ChecklistTask } from '../models/board.models';
import {
  addListToBoard,
  completedTaskCount,
  isAtListLimit,
  isPinned,
  listLimitLabel,
  listProgress,
  listProgressPercent,
  moveListToArchive,
  moveListToTrash,
  pinList,
  reorderLists,
  resolvePinnedListId,
  syncPinnedList,
  taskCounterLabel
} from './board-list-rules';

/**
 * Pruebas de las reglas de las listas del tablero.
 *
 * Estos casos se escribieron contra el comportamiento que ya tenía `BoardPage` (pruebas
 * de caracterización): fijan la regla tal y como es, para que al extraer la lógica nada
 * cambie sin que salte aquí.
 */

/** Reloj fijo: las fechas de descarte y de creación salen de aquí. */
const AHORA = '2026-06-01T12:00:00.000Z';
const AHORA_FIJA = () => AHORA;
const IDS_FIJOS = ['id-1', 'id-2', 'id-3'];
let siguienteId = 0;
const idFijo = () => IDS_FIJOS[siguienteId++] ?? `id-extra-${siguienteId}`;

const tarea = (id: string, completed: boolean, position = 0): ChecklistTask => ({
  id,
  listId: 'l1',
  text: `tarea ${id}`,
  completed,
  position,
  createdAt: '2026-01-01T00:00:00.000Z'
});

const lista = (id: string, position: number, tasks: ChecklistTask[] = []): ChecklistList => ({
  id,
  boardId: 'board-1',
  title: `Lista ${id}`,
  position,
  createdAt: '2026-01-01T00:00:00.000Z',
  tasks
});

/** Tablero con listas dadas por id, con `position` consecutiva salvo que se indique otra. */
const tablero = (listas: ChecklistList[] = [], pinnedListId: string | null = null): ChecklistBoard => ({
  id: 'board-1',
  title: 'Mi tablero',
  createdAt: '2026-01-01T00:00:00.000Z',
  lists: listas,
  pinnedListId
});

/** Listas simples a partir de ids. */
const listas = (...ids: string[]): ChecklistList[] =>
  ids.map((id, index) => lista(id, index));

/** Tablero con N listas, todas con `position` ya normalizada (el límite real es 50). */
const tableroCon = (cantidad: number): ChecklistBoard => ({
  id: 'board-1',
  title: 'Mi tablero',
  createdAt: '2026-01-01T00:00:00.000Z',
  lists: Array.from({ length: cantidad }, (_, i) => lista(`l${i}`, i))
});

describe('board-list-rules: el pin del tablero', () => {
  it('un pin que apunta a una lista inexistente pasa a la primera por position', () => {
    // La primera por position, no la primera del array: el orden estable manda.
    const board = tablero([lista('c', 0), lista('a', 2), lista('b', 1)], 'ya-no-existe');

    const corregido = syncPinnedList(board);

    expect(corregido).toBe(true);
    expect(board.pinnedListId).toBe('c');
  });

  it('un tablero sin pin recibe la primera lista por position', () => {
    const board = tablero([lista('b', 1), lista('a', 0)]);

    expect(syncPinnedList(board)).toBe(true);
    expect(board.pinnedListId).toBe('a');
  });

  it('un tablero sin listas se queda sin pin', () => {
    const board = tablero([], 'algo');

    expect(syncPinnedList(board)).toBe(true);
    expect(board.pinnedListId).toBeNull();
  });

  it('un pin válido no se toca', () => {
    const board = tablero([lista('a', 0), lista('b', 1)], 'b');

    expect(syncPinnedList(board)).toBe(false);
    expect(board.pinnedListId).toBe('b');
  });

  it('con empate de position gana la primera del array', () => {
    // `sort` es estable en JS, así que el resultado no depende del azar.
    const board = tablero([lista('x', 5), lista('y', 5)], 'no-existe');

    expect(syncPinnedList(board)).toBe(true);
    expect(board.pinnedListId).toBe('x');
  });

  it('resolvePinnedListId no modifica nada, solo calcula', () => {
    const board = tablero([lista('a', 0), lista('b', 1)], 'fantasma');
    const antes = structuredClone(board);

    expect(resolvePinnedListId(board)).toBe('a');
    expect(board).toEqual(antes);
  });
});

describe('board-list-rules: fijar una lista', () => {
  it('fija la lista indicada', () => {
    const board = tablero([lista('a', 0), lista('b', 1)], 'a');

    expect(pinList(board, 'b')).toBe(true);
    expect(board.pinnedListId).toBe('b');
  });

  it('fijar la misma lista es un no-op', () => {
    const board = tablero([lista('a', 0), lista('b', 1)], 'a');

    expect(pinList(board, 'a')).toBe(false);
    expect(board.pinnedListId).toBe('a');
  });

  it('isPinned compara con el pin del tablero', () => {
    const board = tablero([lista('a', 0), lista('b', 1)], 'a');
    expect(isPinned(board, 'a')).toBe(true);
    expect(isPinned(board, 'b')).toBe(false);
    expect(isPinned(board, 'no-existe')).toBe(false);
  });

  it('un tablero sin pin no tiene ninguna lista fijada', () => {
    const board = tablero([lista('a', 0)]);
    expect(isPinned(board, 'a')).toBe(false);
  });
});

describe('board-list-rules: crear listas', () => {
  // El generador de ids avanza entre casos: se reinicia para que sean predecibles.
  beforeEach(() => {
    siguienteId = 0;
  });

  it('añade al final y numera las posiciones seguidas', () => {
    const board = tablero([lista('a', 0), lista('b', 1)]);

    const anadida = addListToBoard(board, '  Compra  ', { nuevoId: idFijo, ahora: AHORA_FIJA });

    expect(anadida).toBe(true);
    expect(board.lists.map((l) => l.id)).toEqual(['a', 'b', 'id-1']);
    expect(board.lists.map((l) => l.position)).toEqual([0, 1, 2]);
    expect(board.lists[2].title).toBe('Compra'); // se normaliza el título
    expect(board.lists[2].createdAt).toBe(AHORA);
    expect(board.lists[2].visualColor).toBeUndefined();
  });

  it('un hueco en las posiciones se cierra al añadir', () => {
    const board = tablero([lista('a', 0), lista('b', 5), lista('c', 9)]);

    addListToBoard(board, 'Nueva', { nuevoId: idFijo, ahora: AHORA_FIJA });

    expect(board.lists.map((l) => l.id)).toEqual(['a', 'b', 'c', 'id-1']);
    expect(board.lists.map((l) => l.position)).toEqual([0, 1, 2, 3]);
  });

  it('al inicio renumera las demás y deja la nueva pinneada', () => {
    const board = tablero([lista('a', 0), lista('b', 1)], 'a');

    const anadida = addListToBoard(board, 'Urgente', {
      alInicio: true,
      colorVisual: 'rosa',
      nuevoId: idFijo,
      ahora: AHORA_FIJA
    });

    expect(anadida).toBe(true);
    expect(board.lists.map((l) => l.id)).toEqual(['id-1', 'a', 'b']);
    expect(board.lists.map((l) => l.position)).toEqual([0, 1, 2]);
    expect(board.lists[0].visualColor).toBe('rosa');
    expect(board.pinnedListId).toBe('id-1');
  });

  it('al final no cambia el pin', () => {
    const board = tablero([lista('a', 0), lista('b', 1)], 'a');

    addListToBoard(board, 'Nueva', { nuevoId: idFijo, ahora: AHORA_FIJA });

    expect(board.pinnedListId).toBe('a');
  });

  it('un título vacío o solo espacios no crea nada', () => {
    for (const titulo of ['', '   ', '\n\t  ', ' \r\n ']) {
      const board = tablero([lista('a', 0)]);
      expect(addListToBoard(board, titulo, { nuevoId: idFijo }), JSON.stringify(titulo)).toBe(false);
      expect(board.lists.map((l) => l.id)).toEqual(['a']);
    }
  });

  it('con 50 listas no crea nada y con 49 sí', () => {
    const lleno = tableroCon(50);
    expect(addListToBoard(lleno, 'Una más', { nuevoId: idFijo, ahora: AHORA_FIJA })).toBe(false);
    expect(lleno.lists.length).toBe(50);

    const con49 = tableroCon(49);
    expect(addListToBoard(con49, 'La que cabe', { nuevoId: idFijo, ahora: AHORA_FIJA })).toBe(true);
    expect(con49.lists.length).toBe(50);
    expect(con49.lists.at(-1)!.position).toBe(49);
  });

  it('un título largo se recorta a 90 puntos de código', () => {
    const board = tablero([lista('a', 0)]);

    addListToBoard(board, 'a'.repeat(200), { nuevoId: idFijo, ahora: AHORA_FIJA });

    expect(Array.from(board.lists[1].title).length).toBe(90);
  });
});

describe('board-list-rules: reordenar posiciones', () => {
  it('renumera sin huecos según el orden estable', () => {
    const board = tablero([lista('a', 0), lista('b', 7), lista('c', 3)]);

    reorderLists(board);

    // OJO: ordena una COPIA para decidir los números, pero reescribe la `position` de los
    // objetos, así que el array se queda como estaba ([a, b, c]) con las posiciones ya
    // coherentes entre sí: a=0, c=1, b=2. Quien consume el orden lo hace por `position`,
    // no por la posición en el array.
    expect(board.lists.map((l) => l.position)).toEqual([0, 2, 1]);
    expect(board.lists.map((l) => l.id)).toEqual(['a', 'b', 'c']);
    //Ordenadas por position, las tres quedan seguidas y sin repetir.
    const porPosition = [...board.lists].sort((a, b) => a.position - b.position);
    expect(porPosition.map((l) => l.id)).toEqual(['a', 'c', 'b']);
    expect(porPosition.map((l) => l.position)).toEqual([0, 1, 2]);
  });

  it('sobre un tablero vacío no hace nada', () => {
    const board = tablero([]);
    expect(() => reorderLists(board)).not.toThrow();
    expect(board.lists).toEqual([]);
  });
});

describe('board-list-rules: mover a la papelera', () => {
  it('conserva la lista con sus tareas y la fecha de descarte', () => {
    const board = tablero([lista('a', 0), lista('b', 1, [tarea('t1', false), tarea('t2', true)])]);

    const movida = moveListToTrash(board, 'b', AHORA);

    expect(movida).toBe(true);
    expect(board.lists.map((l) => l.id)).toEqual(['a']);
    expect(board.trashedLists?.length).toBe(1);
    expect(board.trashedLists![0].list.id).toBe('b');
    expect(board.trashedLists![0].list.tasks.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(board.trashedLists![0].deletedAt).toBe(AHORA);
    // Las posiciones se cierran para que no queden huecos.
    expect(board.lists.map((l) => l.position)).toEqual([0]);
  });

  it('no altera las listas que se quedan', () => {
    const board = tablero([lista('a', 0), lista('b', 1, [tarea('t0', false)]), lista('c', 2)]);
    // Las que se quedan, tal y como entraron.
    const esperadas = structuredClone([board.lists[0], board.lists[2]]);

    moveListToTrash(board, 'b', AHORA);

    expect(board.lists.length).toBe(2);
    for (const [index, id] of ['a', 'c'].entries()) {
      const { position, ...resto } = board.lists.find((l) => l.id === id)!;
      expect(resto).toEqual({ ...esperadas[index], position: undefined });
    }
  });

  it('reajusta el pin si la descartada era la fijada', () => {
    const board = tablero([lista('a', 0), lista('b', 1)], 'b');

    moveListToTrash(board, 'b', AHORA);

    // El pin pasa a la primera por position, que ahora es 'a'.
    expect(board.pinnedListId).toBe('a');
  });

  it('mantiene el pin si la descartada no era la fijada', () => {
    const board = tablero([lista('a', 0), lista('b', 1)], 'a');

    moveListToTrash(board, 'b', AHORA);

    expect(board.pinnedListId).toBe('a');
  });

  it('crea la colección de basurero si el tablero no la tenía', () => {
    const board = tablero([lista('a', 0)]);

    moveListToTrash(board, 'a', AHORA);

    expect(board.trashedLists?.length).toBe(1);
  });

  it('una lista que no está en el tablero no hace nada', () => {
    const board = tablero([lista('a', 0)]);

    expect(moveListToTrash(board, 'no-existe', AHORA)).toBe(false);
    expect(board.lists.length).toBe(1);
    expect(board.trashedLists).toBeUndefined();
  });

  it('la lista del basurero es una copia: mutarla no afecta al original', () => {
    const board = tablero([lista('a', 0, [tarea('t1', false)])]);

    moveListToTrash(board, 'a', AHORA);
    const enPapelera = board.trashedLists![0].list;
    enPapelera.tasks.push(tarea('t2', true));
    enPapelera.title = 'Cambiada';

    // La copia es independiente, así que nadie más ve el cambio.
    expect(board.trashedLists![0].list.tasks.length).toBe(2);
    expect(board.trashedLists![0].list.title).toBe('Cambiada');
  });
});

describe('board-list-rules: archivar', () => {
  it('una lista completa sale al archivo con su fecha', () => {
    const board = tablero([lista('a', 0), lista('b', 1, [tarea('t1', true), tarea('t2', true)])], 'b');

    expect(moveListToArchive(board, 'b', AHORA)).toBe(true);

    expect(board.lists.map((l) => l.id)).toEqual(['a']);
    expect(board.archivedLists?.length).toBe(1);
    expect(board.archivedLists![0].list.id).toBe('b');
    expect(board.archivedLists![0].archivedAt).toBe(AHORA);
    expect(board.lists.map((l) => l.position)).toEqual([0]);
    expect(board.pinnedListId).toBe('a');
  });

  it('una lista incompleta no se mueve', () => {
    const board = tablero([lista('a', 0, [tarea('t1', true), tarea('t2', false)])]);

    expect(moveListToArchive(board, 'a', AHORA)).toBe(false);
    expect(board.lists.length).toBe(1);
    expect(board.archivedLists).toBeUndefined();
  });

  it('una lista sin tareas no se archiva', () => {
    // No hay trabajo terminado que archivar.
    const board = tablero([lista('a', 0, [])]);

    expect(moveListToArchive(board, 'a', AHORA)).toBe(false);
  });
});

describe('board-list-rules: límite y progreso del tablero', () => {
  it('isAtListLimit a partir de 50 listas', () => {
    expect(isAtListLimit(tableroCon(49))).toBe(false);
    expect(isAtListLimit(tableroCon(50))).toBe(true);
    expect(isAtListLimit(tableroCon(51))).toBe(true);
    expect(isAtListLimit(tableroCon(0))).toBe(false);
  });

  it('listProgress nunca pasa del 100%', () => {
    expect(listProgress(tableroCon(0))).toBe('0%');
    expect(listProgress(tableroCon(25))).toBe('50%');
    expect(listProgress(tableroCon(50))).toBe('100%');
    expect(listProgress(tableroCon(75))).toBe('100%');
  });

  it('listLimitLabel avisa cuando el tablero está lleno', () => {
    expect(listLimitLabel(tableroCon(49))).toBe('Añadir lista');
    expect(listLimitLabel(tableroCon(50))).toBe('Límite de 50 listas alcanzado');
  });
});

describe('board-list-rules: contadores de una lista', () => {
  it('completedTaskCount cuenta las marcadas', () => {
    expect(completedTaskCount(lista('a', 0, []))).toBe(0);
    expect(completedTaskCount(lista('a', 0, [tarea('1', false), tarea('2', true)]))).toBe(1);
    expect(completedTaskCount(lista('a', 0, [tarea('1', true), tarea('2', true)]))).toBe(2);
  });

  it('listProgressPercent de 0 a 100', () => {
    expect(listProgressPercent(lista('a', 0, []))).toBe(0);
    expect(listProgressPercent(lista('a', 0, [tarea('1', true), tarea('2', true)]))).toBe(100);
    expect(listProgressPercent(lista('a', 0, [tarea('1', true), tarea('2', false)]))).toBe(50);
    // Redondea al entero más cercano: 1 de 3 = 33%.
    expect(listProgressPercent(lista('a', 0, [tarea('1', true), tarea('2', false), tarea('3', false)]))).toBe(33);
  });

  it('taskCounterLabel muestra 100% Hecho solo con tareas completas', () => {
    expect(taskCounterLabel(lista('a', 0, []))).toBe('0/0');
    expect(taskCounterLabel(lista('a', 0, [tarea('1', false)]))).toBe('0/1');
    expect(taskCounterLabel(lista('a', 0, [tarea('1', true)]))).toBe('100% Hecho');
    expect(taskCounterLabel(lista('a', 0, [tarea('1', true), tarea('2', false)]))).toBe('1/2');
    expect(taskCounterLabel(lista('a', 0, [tarea('1', true), tarea('2', true)]))).toBe('100% Hecho');
  });
});

describe('board-list-rules: ninguna función de lectura cambia el tablero', () => {
  it('las lecturas dejan el tablero igual', () => {
    const board = tablero([lista('a', 0, [tarea('1', true)]), lista('b', 1, [tarea('2', false)])]);
    const antes = structuredClone(board);

    isAtListLimit(board);
    listProgress(board);
    listLimitLabel(board);
    resolvePinnedListId(board);
    for (const l of board.lists) {
      completedTaskCount(l);
      listProgressPercent(l);
      taskCounterLabel(l);
    }

    expect(board).toEqual(antes);
  });
});
