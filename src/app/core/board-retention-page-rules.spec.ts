import { describe, expect, it } from 'vitest';
import {
  claseUrgencia,
  diasRestantesSeguro,
  eliminarDelArchivo,
  eliminarDelBasurero,
  esUrgente,
  ordenarEntradasPorFecha,
  restaurarDesdeArchivo,
  restaurarDesdeBasurero,
  textosAccionBasurero,
  vaciarArchivo,
  vaciarBasurero
} from './board-retention-page-rules';
import { purgeExpiredLists } from './trash';
import { purgeExpiredArchivedLists } from './archive';
import type {
  ChecklistArchivedList,
  ChecklistBoard,
  ChecklistList,
  ChecklistTrashedList
} from '../models/board.models';

/**
 * Pruebas de las reglas compartidas del Basurero y del Archivo.
 *
 * Se escribieron contra el comportamiento que ya tenían `TrashPage` y `ArchivePage`
 * (pruebas de caracterización), así que fijan la regla tal y como es.
 */

/** Reloj fijo para poder decidir qué está vencido y qué no. */
const AHORA = new Date('2026-06-01T12:00:00.000Z');
const MS_DIA = 86_400_000;
/** Fecha `dias` días antes de AHORA (acepta decimales). */
const hace = (dias: number): string => new Date(AHORA.getTime() - dias * MS_DIA).toISOString();

const lista = (id: string): ChecklistList => ({
  id,
  boardId: 'board-1',
  title: `Lista ${id}`,
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  tasks: []
});

const descartada = (id: string, dias: number): ChecklistTrashedList => ({
  list: lista(id),
  deletedAt: hace(dias)
});

const archivada = (id: string, dias: number): ChecklistArchivedList => ({
  list: lista(id),
  archivedAt: hace(dias)
});

/** Tablero con `n` listas en el tablero y las descartadas/archivadas dadas. */
const tablero = (
  listas: ChecklistList[] = [],
  trashedLists: ChecklistTrashedList[] = [],
  archivedLists: ChecklistArchivedList[] = []
): ChecklistBoard => ({
  id: 'board-1',
  title: 'Mi tablero',
  createdAt: '2026-01-01T00:00:00.000Z',
  lists: listas,
  trashedLists,
  archivedLists
});

describe('board-retention-page-rules: orden por fecha', () => {
  it('ordena del descarte más reciente al más antiguo', () => {
    const entradas = [descartada('a', 5), descartada('b', 1), descartada('c', 3)];

    expect(ordenarEntradasPorFecha(entradas, (e) => e.deletedAt).map((e) => e.list.id)).toEqual([
      'b',
      'c',
      'a'
    ]);
  });

  it('en el archivo ordena por archivedAt', () => {
    const entradas = [archivada('a', 30), archivada('b', 5), archivada('c', 15)];

    expect(ordenarEntradasPorFecha(entradas, (e) => e.archivedAt).map((e) => e.list.id)).toEqual([
      'b',
      'c',
      'a'
    ]);
  });

  it('no muta el array original', () => {
    const entradas = [descartada('a', 5), descartada('b', 1)];
    const antes = [...entradas];

    ordenarEntradasPorFecha(entradas, (e) => e.deletedAt);

    expect(entradas).toEqual(antes);
  });

  it('con la misma fecha queda como estaba (sort estable)', () => {
    const misma = hace(2);
    const entradas = [
      { list: lista('x'), deletedAt: misma },
      { list: lista('y'), deletedAt: misma }
    ];
    expect(ordenarEntradasPorFecha(entradas, (e) => e.deletedAt).map((e) => e.list.id)).toEqual([
      'x',
      'y'
    ]);
  });
});

describe('board-retention-page-rules: restaurar', () => {
  it('restaura al final del tablero y quita del basurero', () => {
    const board = tablero([lista('viva')], [descartada('a', 1), descartada('b', 3)]);

    expect(restaurarDesdeBasurero(board, board.trashedLists![1])).toBe(true);

    expect(board.lists.map((l) => l.id)).toEqual(['viva', 'b']);
    expect(board.trashedLists!.map((e) => e.list.id)).toEqual(['a']);
    // La posición del tablero se normaliza al restaurar.
    expect(board.lists.map((l) => l.position)).toEqual([0, 1]);
  });

  it('restaura desde el archivo igual', () => {
    const board = tablero([lista('viva')], [], [archivada('a', 1), archivada('b', 10)]);

    expect(restaurarDesdeArchivo(board, board.archivedLists![0])).toBe(true);

    expect(board.lists.map((l) => l.id)).toEqual(['viva', 'a']);
    expect(board.archivedLists!.map((e) => e.list.id)).toEqual(['b']);
  });

  it('con 49 listas resta una y con 50 no mueve nada', () => {
    const con49 = tablero(
      Array.from({ length: 49 }, (_, i) => lista(`l${i}`)),
      [descartada('del-basurero', 1)]
    );
    expect(restaurarDesdeBasurero(con49, con49.trashedLists![0])).toBe(true);
    expect(con49.lists.length).toBe(50);

    const con50 = tablero(
      Array.from({ length: 50 }, (_, i) => lista(`l${i}`)),
      [descartada('del-basurero', 1)]
    );
    expect(restaurarDesdeBasurero(con50, con50.trashedLists![0])).toBe(false);
    expect(con50.lists.length).toBe(50);
    // Bloqueada: la lista se queda en el basurero, no se pierde.
    expect(con50.trashedLists!.length).toBe(1);
  });

  it('una entrada ya restaurada (fuera de la colección) no rompe', () => {
    // Se pasa una entrada que ya no está: el filtro simplemente no la encuentra.
    const board = tablero([lista('viva')], [descartada('a', 1)]);
    const fantasma = descartada('ya-no-esta', 1);

    expect(restaurarDesdeBasurero(board, fantasma)).toBe(true);
    expect(board.lists.map((l) => l.id)).toEqual(['viva', 'ya-no-esta']);
    expect(board.trashedLists!.map((e) => e.list.id)).toEqual(['a']);
  });

  it('restaurar conserva las tareas y su estado', () => {
    const conTareas: ChecklistTrashedList = {
      list: {
        ...lista('completa'),
        tasks: [
          {
            id: 't1',
            listId: 'completa',
            text: 'Hecha',
            completed: true,
            position: 0,
            createdAt: '2026-01-01T00:00:00.000Z'
          }
        ]
      },
      deletedAt: hace(2)
    };
    const board = tablero([], [conTareas]);

    restaurarDesdeBasurero(board, conTareas);

    expect(board.lists[0].tasks.map((t) => t.completed)).toEqual([true]);
    expect(board.trashedLists).toEqual([]);
  });

  /**
   * `restoreListToBoard` solo mira el límite de 50, no si la entrada venía del basurero:
   * restaurar "algo que no estaba" igualmente añade la lista al tablero. En la práctica
   * `TrashPage` solo restaura entradas que está mostrando, así que no se da; se deja
   * anotado porque es la razón por la que no se puede llamar dos veces a `restore`.
   */
  it('un tablero que nunca tuvo basurero restaura igual (y crea el campo vacío)', () => {
    const board: ChecklistBoard = {
      id: 'board-1',
      title: 'Mi tablero',
      createdAt: '2026-01-01T00:00:00.000Z',
      lists: []
    };
    expect(restaurarDesdeBasurero(board, descartada('a', 1))).toBe(true);
    expect(board.lists.map((l) => l.id)).toEqual(['a']);
    expect(board.trashedLists).toEqual([]);
  });
});

describe('board-retention-page-rules: vaciar y eliminar', () => {
  it('vaciar deja el basurero vacío sin tocar el tablero', () => {
    const board = tablero([lista('viva')], [descartada('a', 1), descartada('b', 2)]);

    vaciarBasurero(board);

    expect(board.trashedLists).toEqual([]);
    expect(board.lists.map((l) => l.id)).toEqual(['viva']);
  });

  it('vaciar el archivo deja el archivo vacío', () => {
    const board = tablero([], [], [archivada('a', 1), archivada('b', 20)]);

    vaciarArchivo(board);

    expect(board.archivedLists).toEqual([]);
  });

  it('eliminar una sola entrada deja las demás', () => {
    const board = tablero([], [descartada('a', 1), descartada('b', 5), descartada('c', 3)]);

    eliminarDelBasurero(board, board.trashedLists![2]);

    expect(board.trashedLists!.map((e) => e.list.id)).toEqual(['a', 'b']);
  });

  it('eliminar del archivo deja las demás', () => {
    const board = tablero([], [], [archivada('a', 1), archivada('b', 5), archivada('c', 3)]);

    eliminarDelArchivo(board, board.archivedLists![1]);

    expect(board.archivedLists!.map((e) => e.list.id)).toEqual(['a', 'c']);
  });

  it('vaciar o eliminar en un tablero sin colección no rompe', () => {
    const board = tablero([]);
    expect(() => {
      vaciarBasurero(board);
      vaciarArchivo(board);
      eliminarDelBasurero(board, descartada('a', 1));
      eliminarDelArchivo(board, archivada('a', 1));
    }).not.toThrow();
  });
});

describe('board-retention-page-rules: cuenta atrás', () => {
  it('nunca muestra menos de 1 día', () => {
    expect(diasRestantesSeguro(0)).toBe(1);
    expect(diasRestantesSeguro(-5)).toBe(1);
    expect(diasRestantesSeguro(1)).toBe(1);
    expect(diasRestantesSeguro(7)).toBe(7);
  });

  it('la urgencia se traduce a clase CSS', () => {
    expect(claseUrgencia('normal')).toBe('countdown-normal');
    expect(claseUrgencia('warning')).toBe('countdown-warning');
    expect(claseUrgencia('danger')).toBe('countdown-danger');
  });

  it('solo el tramo final tiñe la tarjeta de rojo', () => {
    expect(esUrgente('normal')).toBe(false);
    expect(esUrgente('warning')).toBe(false);
    expect(esUrgente('danger')).toBe(true);
  });
});

describe('board-retention-page-rules: textos del diálogo', () => {
  it("vaciar avisa de cuántas listas se van", () => {
    const textos = textosAccionBasurero({ kind: 'empty', cantidad: 3 });
    expect(textos.title).toBe('¿Vaciar el basurero?');
    expect(textos.message).toContain('Se eliminarán las 3 listas');
    expect(textos.actionLabel).toBe('Vaciar basurero');
  });

  it('con el basurero vacío el mensaje dice 0 listas', () => {
    // Diálogo raro pero posible: el número sale de lo que se muestra, no de una regla.
    expect(textosAccionBasurero({ kind: 'empty', cantidad: 0 }).message).toContain('las 0 listas');
  });

  it('eliminar una sola avisa de que es definitivo', () => {
    const textos = textosAccionBasurero({ kind: 'purge' });
    expect(textos.title).toBe('¿Eliminar permanentemente?');
    expect(textos.message).toContain('de forma definitiva');
    expect(textos.actionLabel).toBe('Eliminar permanentemente');
  });
});

describe('board-retention-page-rules: la purga al cargar (BUG-09)', () => {
  it('purgeExpiredLists muta el tablero que recibe, no una copia', () => {
    // Las pantallas pasan el objeto que les llega del BehaviorSubject: lo mutan en el
    // sitio. Este test fija que así es, para que nadie "lo arregle" sin querer.
    compartido();
    function compartido() {
      const board = tablero([], [descartada('vencida', 8), descartada('viva', 3)]);

      const purgo = purgeExpiredLists(board, AHORA);

      expect(purgo).toBe(true);
      expect(board.trashedLists!.map((e) => e.list.id)).toEqual(['viva']);
    }
  });

  it('purgeExpiredArchivedLists muta igual', () => {
    const board = tablero([], [], [archivada('vencida', 61), archivada('viva', 30)]);

    expect(purgeExpiredArchivedLists(board, AHORA)).toBe(true);
    expect(board.archivedLists!.map((e) => e.list.id)).toEqual(['viva']);
  });

  it('si no hay nada vencido no cambia nada', () => {
    const board = tablero([], [descartada('viva', 3)]);

    expect(purgeExpiredLists(board, AHORA)).toBe(false);
    expect(board.trashedLists!.length).toBe(1);
  });
});
