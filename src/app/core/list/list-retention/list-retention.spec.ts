import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_POLICY,
  TRASH_POLICY,
  archiveList,
  countdownLabel,
  isListComplete,
  listLimitRestoreMessage,
  MAX_BOARD_LISTS,
  purgeExpiredArchivedLists,
  purgeExpiredLists,
  restoreListToBoard,
  retentionDaysLeft,
  retentionUrgency
} from './list-retention';
import type { ChecklistBoard, ChecklistList } from '../../../models/board.model';

/**
 * Pruebas de la lógica pura de las listas que salen del tablero: el basurero y el archivo.
 * Migrado desde scripts/test-archive.mjs. Se importa `core/list-retention.ts` porque es el
 * módulo sin imports en tiempo de ejecución.
 */

const MS_PER_DAY = 86_400_000;

/** Fecha fija para que los 60 días no dependan del día en que se ejecute la prueba. */
const NOW = new Date('2026-06-01T12:00:00.000Z');

/** Fecha `days` días antes de NOW (admite decimales y negativos para fechas futuras). */
const daysAgo = (days: number): string => new Date(NOW.getTime() - days * MS_PER_DAY).toISOString();

const task = (id: string, listId = 'list-1', completed = false) => ({
  id,
  listId,
  text: id,
  completed,
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z'
});

const makeList = (
  id: string,
  { tasks = [task('t1', id, true)], position = 0 } = {}
): ChecklistList => ({
  id,
  boardId: 'board-1',
  title: id,
  position,
  createdAt: '2026-01-01T00:00:00.000Z',
  tasks
});

type BoardInit = {
  lists?: ChecklistList[];
  trashedLists?: { list: ChecklistList; deletedAt: string }[];
  archivedLists?: { list: ChecklistList; archivedAt: string }[];
};

const makeBoard = (lists: ChecklistList[] = [], { trashedLists = [], archivedLists = [] }: BoardInit = {}): ChecklistBoard => ({
  id: 'board-1',
  title: 'Board',
  createdAt: '2026-01-01T00:00:00.000Z',
  lists,
  trashedLists,
  archivedLists
});

/** Entrada de archivo con la fecha a `days` días de ahora. */
const archivedEntry = (list: ChecklistList, days: number) => ({ list, archivedAt: daysAgo(days) });

/** Tablero con `count` listas, todas con la posición ya normalizada. */
const boardWithLists = (count: number, extra: BoardInit = {}): ChecklistBoard =>
  makeBoard(Array.from({ length: count }, (_, i) => makeList(`l${i}`, { position: i })), extra);

describe('list-retention: políticas y constantes', () => {
  it('el archivo se conserva 60 días y avisa en rojo los 3 últimos', () => {
    expect(ARCHIVE_POLICY.retentionDays).toBe(60);
    expect(ARCHIVE_POLICY.dangerDays).toBe(3);
    expect(ARCHIVE_POLICY.warningDays).toBe(15);
    // El basurero no cambia: 7 días, rojo en el último.
    expect(TRASH_POLICY.retentionDays).toBe(7);
    expect(TRASH_POLICY.dangerDays).toBe(1);
    expect(TRASH_POLICY.warningDays).toBe(3);
  });
});

describe('list-retention: purga por plazo', () => {
  it('la purga del archivo conserva a los 59 días y elimina a los 60', () => {
    const board = makeBoard([], { archivedLists: [archivedEntry(makeList('a'), 59)] });
    expect(purgeExpiredArchivedLists(board, NOW)).toBe(false);
    expect(board.archivedLists?.map((e) => e.list.id)).toEqual(['a']);

    const vencido = makeBoard([], { archivedLists: [archivedEntry(makeList('b'), 60)] });
    expect(purgeExpiredArchivedLists(vencido, NOW)).toBe(true);
    expect(vencido.archivedLists).toEqual([]);

    // Justo en el límite: 59 días casi completos sigue viva, 60 días exactos ya no.
    const casi = makeBoard([], { archivedLists: [archivedEntry(makeList('c'), 59.99999)] });
    expect(purgeExpiredArchivedLists(casi, NOW)).toBe(false);
    expect(casi.archivedLists?.map((e) => e.list.id)).toEqual(['c']);
    const justo = makeBoard([], { archivedLists: [archivedEntry(makeList('d'), 59)] });
    expect(purgeExpiredArchivedLists(justo, NOW)).toBe(false);
  });

  it('la purga del archivo no toca el basurero ni el tablero, y al revés', () => {
    const board = makeBoard([makeList('viva')], {
      // Cada colección con una entrada vencida y otra vigente, cada una con su propio plazo.
      trashedLists: [
        { list: makeList('basura-vieja'), deletedAt: daysAgo(8) },
        { list: makeList('basura-nueva'), deletedAt: daysAgo(2) }
      ],
      archivedLists: [
        archivedEntry(makeList('archivo-viejo'), 61),
        archivedEntry(makeList('archivo-nuevo'), 30)
      ]
    });

    // Purga del archivo: cae la de 61 días y el basurero queda igual.
    expect(purgeExpiredArchivedLists(board, NOW)).toBe(true);
    expect(board.archivedLists?.map((e) => e.list.id)).toEqual(['archivo-nuevo']);
    expect(board.trashedLists?.map((e) => e.list.id)).toEqual(['basura-vieja', 'basura-nueva']);
    expect(board.lists.map((l) => l.id)).toEqual(['viva']);

    // Purga del basurero: cae la de 8 días y el archivo queda igual.
    expect(purgeExpiredLists(board, NOW)).toBe(true);
    expect(board.trashedLists?.map((e) => e.list.id)).toEqual(['basura-nueva']);
    expect(board.archivedLists?.map((e) => e.list.id)).toEqual(['archivo-nuevo']);
    expect(board.lists.map((l) => l.id)).toEqual(['viva']);
  });

  it('un tablero antiguo sin archivedLists se purga sin errores', () => {
    const antiguo: ChecklistBoard = {
      id: 'board-1',
      title: 'Board',
      createdAt: '2026-01-01T00:00:00.000Z',
      lists: [makeList('a')],
      trashedLists: []
    };
    expect(purgeExpiredArchivedLists(antiguo, NOW)).toBe(false);
    expect(antiguo.archivedLists).toBeUndefined();
    expect(antiguo.lists.length).toBe(1);
    expect(purgeExpiredLists(antiguo, NOW)).toBe(false);
    // Y archivar sobre un tablero así crea la colección desde cero.
    for (const t of antiguo.lists[0].tasks) t.completed = true;
    expect(archiveList(antiguo, antiguo.lists[0], NOW)).toBe(true);
    expect(antiguo.archivedLists?.length).toBe(1);
  });
});

describe('list-retention: cuenta atrás', () => {
  it('los días restantes van de 60 hacia abajo', () => {
    expect(retentionDaysLeft(daysAgo(0), ARCHIVE_POLICY, NOW)).toBe(60);
    expect(retentionDaysLeft(daysAgo(1), ARCHIVE_POLICY, NOW)).toBe(59);
    expect(retentionDaysLeft(daysAgo(15), ARCHIVE_POLICY, NOW)).toBe(45);
    expect(retentionDaysLeft(daysAgo(59), ARCHIVE_POLICY, NOW)).toBe(1);
    expect(retentionDaysLeft(daysAgo(60), ARCHIVE_POLICY, NOW)).toBe(0);
    // El redondeo va hacia arriba: medio día restante todavía cuenta como el día entero.
    expect(retentionDaysLeft(daysAgo(0.5), ARCHIVE_POLICY, NOW)).toBe(60);
  });

  it('el color escala a 60 días y se pone rojo en los 3 últimos días', () => {
    expect(retentionUrgency(60, ARCHIVE_POLICY)).toBe('normal');
    expect(retentionUrgency(16, ARCHIVE_POLICY)).toBe('normal');
    expect(retentionUrgency(15, ARCHIVE_POLICY)).toBe('warning');
    expect(retentionUrgency(4, ARCHIVE_POLICY)).toBe('warning');
    expect(retentionUrgency(3, ARCHIVE_POLICY)).toBe('danger');
    expect(retentionUrgency(2, ARCHIVE_POLICY)).toBe('danger');
    expect(retentionUrgency(1, ARCHIVE_POLICY)).toBe('danger');
    // Vencida también se pinta de rojo: aunque la purga ya la habría quitado.
    expect(retentionUrgency(0, ARCHIVE_POLICY)).toBe('danger');
  });

  it('el badge dice "N días" y marca el último día', () => {
    expect(countdownLabel(60)).toBe('60 días');
    expect(countdownLabel(2)).toBe('2 días');
    expect(countdownLabel(1)).toBe('1 día (Último día)');
    // Nunca 0 ni negativos, aunque la lista ya haya vencido.
    expect(countdownLabel(0)).toBe('1 día (Último día)');
    expect(countdownLabel(-3)).toBe('1 día (Último día)');
  });
});

describe('list-retention: archivar y restaurar', () => {
  it('una lista incompleta no se archiva y una completa sí', () => {
    const incompleta = makeList('a', { tasks: [task('t1', 'a', true), task('t2', 'a', false)] });
    expect(isListComplete(incompleta)).toBe(false);
    const boardIncompleta = makeBoard([incompleta]);
    expect(archiveList(boardIncompleta, incompleta, NOW)).toBe(false);
    expect(boardIncompleta.lists.map((l) => l.id)).toEqual(['a']);
    expect(boardIncompleta.archivedLists).toEqual([]);

    // Sin tareas tampoco cuenta como terminada: no hay trabajo terminado que archivar.
    const vacia = makeList('v', { tasks: [] });
    expect(archiveList(makeBoard([vacia]), vacia, NOW)).toBe(false);

    const completa = makeList('b');
    const boardCompleta = makeBoard([completa, makeList('c')]);
    expect(archiveList(boardCompleta, completa, NOW)).toBe(true);
    expect(boardCompleta.lists.map((l) => l.id)).toEqual(['c']);
    expect(boardCompleta.archivedLists?.length).toBe(1);
    expect(boardCompleta.archivedLists?.[0].list.id).toBe('b');
    expect(boardCompleta.archivedLists?.[0].archivedAt).toBe(NOW.toISOString());
    // Las tareas y su estado se guardan tal cual.
    expect(boardCompleta.archivedLists?.[0].list.tasks.map((t) => t.completed)).toEqual([true]);
  });

  it('restaurar devuelve la lista al final del tablero', () => {
    const archivada = makeList('a', { tasks: [task('t1', 'a', true), task('t2', 'a', true)], position: 7 });
    const board = makeBoard([makeList('x', { position: 0 }), makeList('y', { position: 1 })], {
      archivedLists: [archivedEntry(archivada, 10)]
    });
    expect(restoreListToBoard(board, archivada)).toBe(true);
    expect(board.lists.map((l) => l.id)).toEqual(['x', 'y', 'a']);
    // La posición guardada es la última, que es el orden estable que usa el tablero.
    expect(board.lists.map((l) => l.position)).toEqual([0, 1, 2]);
    expect(board.lists[2].tasks.length).toBe(2);
    expect(board.lists[2].tasks.every((t) => t.completed)).toBe(true);
  });

  it('bloqueada, la lista sigue en el archivo', () => {
    const archivada = makeList('a');
    const board = boardWithLists(50, { archivedLists: [archivedEntry(archivada, 5)] });
    expect(restoreListToBoard(board, board.archivedLists![0].list)).toBe(false);
    expect(board.archivedLists?.map((e) => e.list.id)).toEqual(['a']);
    expect(board.lists.length).toBe(50);
  });
});

describe('list-retention: límite de 50 listas', () => {
  it('el bloqueo por límite permite con 49 listas y corta con 50', () => {
    expect(MAX_BOARD_LISTS).toBe(50);

    const con49 = boardWithLists(49);
    expect(restoreListToBoard(con49, makeList('nueva'))).toBe(true);
    expect(con49.lists.length).toBe(50);
    expect(con49.lists.at(-1)?.id).toBe('nueva');

    const con50 = boardWithLists(50);
    expect(restoreListToBoard(con50, makeList('nueva'))).toBe(false);
    // Bloqueada significa intacta: el tablero no crece y la lista no se pierde.
    expect(con50.lists.length).toBe(50);
    expect(con50.lists.some((l) => l.id === 'nueva')).toBe(false);

    // El mensaje dice cuántos hay y qué hacer para poder recuperar la lista.
    expect(listLimitRestoreMessage()).toBe(
      'Tu tablero ya tiene 50 listas. Elimina o archiva una para poder restaurar esta.'
    );
  });

  it('lo archivado y lo descartado no cuentan para el límite de 50 listas', () => {
    const board = boardWithLists(50, {
      trashedLists: [{ list: makeList('basura'), deletedAt: daysAgo(3) }],
      archivedLists: [archivedEntry(makeList('archivada'), 30)]
    });
    expect(board.lists.length).toBe(MAX_BOARD_LISTS);
    // El límite mira solo board.lists, así que con 50 sigue bloqueado...
    expect(restoreListToBoard(board, makeList('otra'))).toBe(false);
    // ...pero si una lista sale del tablero (p. ej. se archiva), ya cabe otra.
    for (const list of board.lists) for (const t of list.tasks) t.completed = true;
    expect(archiveList(board, board.lists[0], NOW)).toBe(true);
    expect(board.lists.length).toBe(49);
    expect(restoreListToBoard(board, makeList('otra'))).toBe(true);
    expect(board.lists.length).toBe(50);
    expect(board.lists.at(-1)?.id).toBe('otra');
  });
});

/**
 * Verificación: el repositorio conserva archivedLists al leer y al guardar.
 *
 * `deserializeBoard` es privada en SupabaseBoardRepository, así que aquí se reproduce
 * tal cual (como hacía el script original) para poder probarla sin levantar Angular ni
 * Supabase. Si cambia en el repositorio, hay que cambiarla también aquí.
 */
const deserializeBoard = (record: {
  id: string;
  title: string;
  created_at: string;
  board_data: unknown;
}): ChecklistBoard => {
  const data = record.board_data as Partial<ChecklistBoard> | null;
  if (data && Array.isArray(data.lists)) {
    return {
      ...data,
      id: record.id,
      title: record.title,
      createdAt: record.created_at
    } as ChecklistBoard;
  }
  return { id: record.id, title: record.title, createdAt: record.created_at, lists: [] };
};

const storedRecord = (boardData: Record<string, unknown>) => ({
  id: 'board-1',
  title: 'Board',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  board_data: boardData
});

describe('list-retention: lo que conserva el repositorio al leer', () => {
  it('deserializeBoard conserva archivedLists y trashedLists al leer y al guardar', () => {
    const stored = storedRecord({
      id: 'board-1',
      title: 'Board',
      createdAt: '2026-01-01T00:00:00.000Z',
      lists: [],
      trashedLists: [{ list: makeList('t'), deletedAt: daysAgo(1) }],
      archivedLists: [archivedEntry(makeList('a'), 20)]
    });
    const board = deserializeBoard(stored);
    expect(board.archivedLists?.length).toBe(1);
    expect(board.archivedLists?.[0].list.id).toBe('a');
    expect(board.trashedLists?.length).toBe(1);
    // Lo que devuelve deserializeBoard es justo lo que updateBoard vuelve a guardar.
    const reSaved = JSON.parse(JSON.stringify(board));
    expect(reSaved.archivedLists).toEqual(stored.board_data['archivedLists']);
  });

  it('un tablero antiguo sin archivedLists carga sin errores', () => {
    const board = deserializeBoard(storedRecord({
      id: 'board-1',
      title: 'Board',
      createdAt: '2026-01-01T00:00:00.000Z',
      lists: [makeList('a')]
    }));
    expect(board.lists.map((l) => l.id)).toEqual(['a']);
    expect(board.archivedLists).toBeUndefined();
    expect(purgeExpiredArchivedLists(board, NOW)).toBe(false);
  });

  it('un board_data que no es un tablero cae al tablero vacío y purga sin errores', () => {
    const board = deserializeBoard(storedRecord({ foo: 1 }));
    expect(board.lists).toEqual([]);
    expect(board.archivedLists).toBeUndefined();
    expect(purgeExpiredArchivedLists(board, NOW)).toBe(false);
  });
});

/**
 * BUG-02: una fecha ilegible en el basurero o en el archivo borraba la lista.
 *
 * `Date.parse('lo-que-sea')` da NaN, y `NaN > 0` es false, así que la entrada caía en el
 * filtro de "vencida" y desaparecía en el siguiente arranque. Además `daysLeft` habría
 * pintado "NaN días". Regla acordada: una fecha inválida NUNCA purga; la entrada se
 * conserva y se trata como recién descartada (plazo completo por delante).
 */
describe('list-retention: fechas inválidas (BUG-02)', () => {
  /** Fechas que no se pueden interpretar, en todas las formas que pueden llegar. */
  const fechasInvalidas: unknown[] = [
    '',
    '   ',
    'no-es-una-fecha',
    'ayer',
    '2026-13-45T99:99:99Z',
    'null',
    'undefined',
    'Invalid Date',
    null,
    undefined,
    0,
    42,
    NaN,
    true,
    {},
    []
  ];

  it('retentionDaysLeft con fecha inválida devuelve el plazo completo del basurero', () => {
    for (const startedAt of fechasInvalidas) {
      expect(retentionDaysLeft(startedAt as string, TRASH_POLICY, NOW)).toBe(7);
    }
  });

  it('retentionDaysLeft con fecha inválida devuelve el plazo completo del archivo', () => {
    for (const startedAt of fechasInvalidas) {
      expect(retentionDaysLeft(startedAt as string, ARCHIVE_POLICY, NOW)).toBe(60);
    }
  });

  it('la purga del basurero conserva una entrada con fecha inválida', () => {
    for (const deletedAt of fechasInvalidas) {
      const board = makeBoard([], {
        trashedLists: [{ list: makeList('l1'), deletedAt: deletedAt as string }]
      });
      expect(purgeExpiredLists(board, NOW), `no debe purgar ${JSON.stringify(deletedAt)}`).toBe(false);
      expect(board.trashedLists?.length).toBe(1);
      expect(board.trashedLists?.[0].list.id).toBe('l1');
    }
  });

  it('la purga del archivo conserva una entrada con fecha inválida', () => {
    for (const archivedAt of fechasInvalidas) {
      const board = makeBoard([], {
        archivedLists: [{ list: makeList('l1'), archivedAt: archivedAt as string }]
      });
      expect(purgeExpiredArchivedLists(board, NOW), `no debe purgar ${JSON.stringify(archivedAt)}`).toBe(
        false
      );
      expect(board.archivedLists?.length).toBe(1);
      expect(board.archivedLists?.[0].list.id).toBe('l1');
    }
  });

  it('la cuenta atrás nunca muestra NaN ni valores negativos', () => {
    for (const startedAt of fechasInvalidas) {
      const dias = retentionDaysLeft(startedAt as string, TRASH_POLICY, NOW);
      expect(Number.isNaN(dias)).toBe(false);
      expect(dias).toBeGreaterThan(0);
      expect(countdownLabel(dias)).toBe('7 días');
    }
  });

  /**
   * El límite de la regla: una fecha que SÍ es interpretable, aunque sea absurda, se purga
   * con normalidad. `null` y `0` dan el 1 de enero de 1970 con `new Date(...)`, así que
   * estos casos fijan que no se está conservando todo por defecto.
   */
  it('una fecha válida pero antiquísima sí se purga', () => {
    const antiguas = ['1970-01-01T00:00:00.000Z', '1999-12-31T23:59:59.000Z'];
    for (const deletedAt of antiguas) {
      const board = makeBoard([], {
        trashedLists: [{ list: makeList('l1'), deletedAt }]
      });
      expect(purgeExpiredLists(board, NOW)).toBe(true);
      expect(board.trashedLists).toEqual([]);
      expect(retentionDaysLeft(deletedAt, TRASH_POLICY, NOW)).toBeLessThan(0);
    }
  });
});
