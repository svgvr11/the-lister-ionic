import { describe, expect, it } from 'vitest';
import { canonicalBoardContentKey, OwnBoardSnapshots } from './board-sync';
import { mergeBoardAdditions } from '../board-merge/board-merge';
import { moveListBefore } from '../board-list-rules/board-list-rules';
import type { ChecklistBoard } from '../../../models/board.model';

/**
 * Pruebas del detector de ecos propios. Migrado desde scripts/test-board-sync.mjs.
 *
 * Cuando la app guarda, Supabase le devuelve el mismo tablero por el canal de realtime.
 * Sin `OwnBoardSnapshots` ese eco se confundiría con un cambio de otro dispositivo y
 * abriría un conflicto inventado.
 */

/**
 * Ficha del tablero base. A propósito NO lleva `boardId` ni `createdAt` en la lista ni
 * `listId` en la tarea, igual que el script original: `canonicalBoardContentKey` solo mira
 * id, título, createdAt, pin, listas, basurero y archivo, así que añadir campos aquí
 * cambiaría la clave y el eco canónico dejaría de reconocerse. Por eso el molde va con
 * casteo y no como ChecklistBoard.
 */
const base = {
  id: 'board-1',
  title: 'Board',
  createdAt: '2026-01-01T00:00:00.000Z',
  pinnedListId: null,
  lists: [
    {
      id: 'list-1',
      title: 'List',
      position: 0,
      tasks: [
        {
          id: 'task-1',
          text: 'Original',
          completed: false,
          position: 0,
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ]
    }
  ],
  trashedLists: [],
  archivedLists: []
} as unknown as ChecklistBoard;

describe('board-sync: canonicalBoardContentKey', () => {
  it('reconoce como eco propio un tablero canónicamente equivalente', () => {
    const snapshots = new OwnBoardSnapshots();
    const token = snapshots.begin(base);
    snapshots.complete(token, true);
    const equivalentEcho = {
      archivedLists: [],
      trashedLists: [],
      lists: [
        {
          tasks: [
            {
              position: 0,
              completed: false,
              text: 'Original',
              id: 'task-1',
              createdAt: '2025-12-31T21:00:00-03:00'
            }
          ],
          position: 0,
          title: 'List',
          id: 'list-1',
          updated_at: 'server-only',
          serverVersion: 'row-version'
        }
      ],
      pinnedListId: null,
      createdAt: '2026-01-01T00:00:00Z',
      title: 'Board',
      id: 'board-1',
      version: 3,
      updated_at: 'another-server-value'
    };
    expect(snapshots.has(equivalentEcho)).toBe(true);
  });

  it('no clasifica como eco propio un cambio remoto de verdad', () => {
    const snapshots = new OwnBoardSnapshots();
    const token = snapshots.begin(base);
    snapshots.complete(token, true);
    const remote = structuredClone(base);
    remote.lists[0].title = 'Changed remotely';
    expect(snapshots.has(remote)).toBe(false);
  });
});

describe('board-sync: OwnBoardSnapshots', () => {
  it('un eco tardío de A no sustituye al guardado más reciente B', () => {
    const snapshots = new OwnBoardSnapshots();
    const savedA = structuredClone(base);
    savedA.lists[0].title = 'Saved A';
    const tokenA = snapshots.begin(savedA);
    snapshots.complete(tokenA, true);

    const savedB = structuredClone(savedA);
    savedB.lists[0].title = 'Saved B';
    const tokenB = snapshots.begin(savedB);
    snapshots.complete(tokenB, true);

    let current = structuredClone(savedB);
    const echoedA = structuredClone(savedA);
    if (!snapshots.has(echoedA)) current = echoedA;
    expect(current.lists[0].title).toBe('Saved B');
    expect(snapshots.has(echoedA)).toBe(true);
  });

  it('conserva solo los 20 últimos snapshots y olvida los guardados fallidos', () => {
    const snapshots = new OwnBoardSnapshots();
    const boards: ChecklistBoard[] = Array.from({ length: 21 }, (_, index) => ({
      ...structuredClone(base),
      title: `Snapshot ${index}`
    }));
    for (const board of boards) {
      const token = snapshots.begin(board);
      snapshots.complete(token, true);
    }
    expect(snapshots.has(boards[0])).toBe(false);
    expect(snapshots.has(boards[20])).toBe(true);

    const failed = snapshots.begin({ ...structuredClone(base), title: 'Failed save' });
    snapshots.complete(failed, false);
    expect(snapshots.has({ ...structuredClone(base), title: 'Failed save' })).toBe(false);
  });
});

describe('board-merge: ediciones divergentes', () => {
  it('dos ediciones distintas de la misma tarea siguen siendo un conflicto', () => {
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.lists[0].tasks[0].text = 'Local task edit';
    remote.lists[0].tasks[0].text = 'Remote task edit';
    expect(() => mergeBoardAdditions(base, local, remote)).toThrow(/editadas/i);
  });
});

/**
 * El `updatedAt` de la lista es metadato de sincronización, no contenido: la clave canónica lo
 * descarta (es un campo de servidor). Si no lo fuera, el eco de un guardado propio dejaría de
 * reconocerse cada vez que el merge escribe `max(local, remoto)` y aparecerían conflictos
 * inventados. Estos casos fijan que las diferencias de `updatedAt` no se ven como cambio ajeno.
 */
describe('board-sync: updatedAt y el eco propio', () => {
  it('dos tableros cuyas listas solo difieren en updatedAt son el mismo contenido', () => {
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.lists[0].updatedAt = '2026-01-05T10:00:00.000Z';
    remote.lists[0].updatedAt = '2026-01-04T09:00:00.000Z';

    expect(canonicalBoardContentKey(remote)).toBe(canonicalBoardContentKey(local));
  });

  it('el eco de un guardado con updatedAt se reconoce aunque traiga otra fecha', () => {
    const snapshots = new OwnBoardSnapshots();
    const saved = structuredClone(base);
    saved.lists[0].updatedAt = '2026-01-05T10:00:00.000Z';
    const token = snapshots.begin(saved);
    snapshots.complete(token, true);

    // Lo que devuelve el canal de realtime tras una fusión: el mismo contenido, otra fecha.
    const echoed = structuredClone(base);
    echoed.lists[0].updatedAt = '2026-01-06T08:00:00.000Z';

    expect(snapshots.has(echoed)).toBe(true);
  });

  it('un cambio remoto de verdad en la misma lista sigue sin ser eco propio', () => {
    const snapshots = new OwnBoardSnapshots();
    const saved = structuredClone(base);
    saved.lists[0].updatedAt = '2026-01-05T10:00:00.000Z';
    const token = snapshots.begin(saved);
    snapshots.complete(token, true);

    const remote = structuredClone(saved);
    remote.lists[0].tasks.push({
      id: 'task-2',
      listId: 'list-1',
      text: 'Desde otro dispositivo',
      completed: false,
      position: 1,
      createdAt: '2026-01-06T08:00:00.000Z'
    });

    expect(snapshots.has(remote)).toBe(false);
  });
});

/**
 * Un reorden de listas cambia `position` y recoloca el array. La clave canónica incluye las
 * listas tal cual (sin los metadatos de servidor), así que el eco de un guardado recién
 * reordenado se reconoce igual que antes: si no, cada reorden se vería como un cambio de
 * otro dispositivo y el tablero entraría en bucle de guardados.
 */
describe('board-sync: el eco propio tras reordenar', () => {
  /** Mismo tablero con las dos listas cruzadas: «Casa» delante de «Compra». */
  const reordenado = (): ChecklistBoard => {
    const board: ChecklistBoard = {
      ...structuredClone(base),
      lists: [
        {
          id: 'list-1',
          boardId: 'board-1',
          title: 'Compra',
          position: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          tasks: []
        },
        {
          id: 'list-2',
          boardId: 'board-1',
          title: 'Casa',
          position: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          tasks: []
        }
      ]
    };
    moveListBefore(board, 'list-2', 'list-1');
    return board;
  };

  it('el eco del tablero reordenado se reconoce como propio', () => {
    const snapshots = new OwnBoardSnapshots();
    const token = snapshots.begin(reordenado());
    snapshots.complete(token, true);

    expect(snapshots.has(reordenado())).toBe(true);
  });

  it('un reorden que ha hecho otro dispositivo no es eco propio', () => {
    const snapshots = new OwnBoardSnapshots();
    const guardado: ChecklistBoard = {
      ...structuredClone(base),
      lists: [
        {
          id: 'list-1',
          boardId: 'board-1',
          title: 'Compra',
          position: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          tasks: []
        },
        {
          id: 'list-2',
          boardId: 'board-1',
          title: 'Casa',
          position: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          tasks: []
        }
      ]
    };
    const token = snapshots.begin(guardado);
    snapshots.complete(token, true);

    expect(snapshots.has(reordenado())).toBe(false);
  });
});
