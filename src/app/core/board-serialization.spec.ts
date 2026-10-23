import { describe, expect, it } from 'vitest';
import {
  StoredBoard,
  deserializeBoard,
  isNewerVersion,
  isSameVersion,
  nextBoardVersion
} from './board-serialization';
import type { ChecklistBoard } from '../models/board.model';

/**
 * Pruebas de la serialización del tablero y de sus versiones.
 *
 * Estas funciones vivían dentro de `SupabaseBoardRepository` y son la puerta de entrada de
 * todos los datos que vienen de la nube: si deserializan mal, se pierde el tablero del
 * usuario; si las versiones se calculan mal, los guardados se pisan entre sí.
 */

/** Reloj fijo: las versiones se calculan contra un instante concreto. */
const AHORA = new Date('2026-06-01T12:00:00.000Z');
const AHORA_MS = AHORA.getTime();
const AHORA_ISO = AHORA.toISOString();

/** Cualquier cosa que no sea un tablero válido, para probar la rama de degradado. */
const boardDataInvalido = (vacio: unknown): StoredBoard['board_data'] =>
  vacio as unknown as StoredBoard['board_data'];

/** Registro de Supabase con el tablero dentro de `board_data`. */
const registro = (boardData: StoredBoard['board_data']): StoredBoard => ({
  id: 'board-remoto',
  title: 'Título de la fila',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: AHORA_ISO,
  board_data: boardData
});

/** Tablero completo, con pin, basurero y archivo. */
const tableroCompleto = (): ChecklistBoard => ({
  id: 'id-que-no-manda',
  title: 'Título que no manda',
  createdAt: '1999-01-01T00:00:00.000Z',
  pinnedListId: 'lista-pin',
  lists: [
    {
      id: 'lista-1',
      boardId: 'board-remoto',
      title: 'Compra',
      position: 0,
      createdAt: '2026-01-02T00:00:00.000Z',
      tasks: [
        {
          id: 'tarea-1',
          listId: 'lista-1',
          text: 'Leche',
          completed: false,
          position: 0,
          createdAt: '2026-01-02T00:00:00.000Z'
        }
      ]
    }
  ],
  trashedLists: [
    { list: listaDescartada('lista-2'), deletedAt: '2026-05-30T00:00:00.000Z' }
  ],
  archivedLists: [{ list: listaDescartada('lista-3'), archivedAt: '2026-05-01T00:00:00.000Z' }]
});

const listaDescartada = (id: string): ChecklistBoard['lists'][number] => ({
  id,
  boardId: 'board-remoto',
  title: id,
  position: 0,
  createdAt: '2026-01-02T00:00:00.000Z',
  tasks: []
});

describe('board-serialization: deserializeBoard', () => {
  it('un tablero válido se conserva entero, salvo id, título y fecha', () => {
    const result = deserializeBoard(registro(tableroCompleto()));

    // Estos tres siempre vienen de la fila, no de board_data.
    expect(result.id).toBe('board-remoto');
    expect(result.title).toBe('Título de la fila');
    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
    // El contenido sí se conserva tal cual.
    expect(result.pinnedListId).toBe('lista-pin');
    expect(result.lists.map((l) => l.id)).toEqual(['lista-1']);
    expect(result.lists[0].tasks.map((t) => t.id)).toEqual(['tarea-1']);
    expect(result.trashedLists?.map((e) => e.list.id)).toEqual(['lista-2']);
    expect(result.archivedLists?.map((e) => e.list.id)).toEqual(['lista-3']);
  });

  it('board_data null da un tablero vacío con los datos de la fila', () => {
    const result = deserializeBoard(registro(null));
    expect(result).toEqual({
      id: 'board-remoto',
      title: 'Título de la fila',
      createdAt: '2026-01-01T00:00:00.000Z',
      lists: []
    });
  });

  it('board_data sin lists da tablero vacío', () => {
    for (const vacio of [{}, { id: 'x' }, { lists: null }, { lists: 'no-es-array' }]) {
      const result = deserializeBoard(registro(boardDataInvalido(vacio)));
      expect(result.lists).toEqual([]);
    }
  });

  it('board_data que no es un objeto da tablero vacío', () => {
    for (const basura of ['texto', 42, [], true]) {
      const result = deserializeBoard(registro(boardDataInvalido(basura)));
      expect(result.lists).toEqual([]);
      expect(result.id).toBe('board-remoto');
    }
  });

  it('un tablero antiguo sin pin, basurero ni archivo carga sin esos campos', () => {
    // Los campos nuevos son opcionales: estos tableros deben seguir cargando.
    const antiguo = {
      id: 'viejo',
      title: 'Viejo',
      createdAt: '2026-01-01T00:00:00.000Z',
      lists: []
    } as ChecklistBoard;
    const result = deserializeBoard(registro(antiguo));

    expect(result.pinnedListId).toBeUndefined();
    expect(result.trashedLists).toBeUndefined();
    expect(result.archivedLists).toBeUndefined();
    expect(result.lists).toEqual([]);
  });

  it('los campos desconocidos de board_data se conservan', () => {
    // Decisión actual del código: en la rama con listas se hace `...data`, así que
    // cualquier campo extra que traiga board_data sobrevive. En la rama vacía no.
    const conExtras = {
      ...tableroCompleto(),
      campoFuturo: 'se conserva'
    } as ChecklistBoard & { campoFuturo: string };
    const result = deserializeBoard(registro(conExtras)) as ChecklistBoard & {
      campoFuturo?: string;
    };
    expect(result.campoFuturo).toBe('se conserva');

    const vacio = deserializeBoard(registro(boardDataInvalido({ campoFuturo: 'se pierde' })));
    expect((vacio as unknown as { campoFuturo?: string }).campoFuturo).toBeUndefined();
  });

  it('el registro de entrada no se modifica y se devuelve un objeto nuevo', () => {
    const record = registro(tableroCompleto());
    const copia = structuredClone(record);

    const result = deserializeBoard(record);

    expect(record).toEqual(copia); // no se muta la fila
    expect(result).not.toBe(record.board_data); // es otro objeto
    // Pero la copia es superficial: las listas se comparten con board_data.
    expect(result.lists).toBe(record.board_data!.lists);
  });
});

describe('board-serialization: nextBoardVersion', () => {
  it('con versión válida devuelve una fecha estrictamente mayor', () => {
    const expected = AHORA_ISO;
    const next = nextBoardVersion(expected, AHORA_MS);

    expect(Date.parse(next)).toBeGreaterThan(Date.parse(expected));
    // Como el reloj coincide con la versión, se suma 1 ms.
    expect(next).toBe(new Date(AHORA_MS + 1).toISOString());
  });

  it('si el reloj va por detrás de la versión, usa versión + 1 ms', () => {
    const expected = new Date(AHORA_MS + 60_000).toISOString(); // un minuto por delante
    const next = nextBoardVersion(expected, AHORA_MS);

    expect(next).toBe(new Date(AHORA_MS + 60_001).toISOString());
  });

  it('si el reloj va por delante de la versión, usa el reloj', () => {
    const expected = new Date(AHORA_MS - 60_000).toISOString(); // un minuto por detrás
    const next = nextBoardVersion(expected, AHORA_MS);

    expect(next).toBe(AHORA_ISO);
  });

  it('sin versión esperada válida no lanza y devuelve una fecha utilizable', () => {
    for (const invalida of ['', 'no-es-fecha', 'ayer', 'null', NaN]) {
      const next = nextBoardVersion(invalida as string, AHORA_MS);
      expect(Number.isNaN(Date.parse(next))).toBe(false);
      expect(next).toBe(AHORA_ISO);
    }
  });

  it('acepta null y undefined sin lanzar', () => {
    // El tipo dice string, pero el valor viene de una fila remota: puede ser cualquier cosa.
    for (const invalida of [null, undefined]) {
      const next = nextBoardVersion(invalida as unknown as string, AHORA_MS);
      expect(next).toBe(AHORA_ISO);
    }
  });

  it('dos llamadas seguidas dan versiones distintas y crecientes', () => {
    // Cada guardado necesita su propia versión: si se repitiera, el filtro por updated_at
    // no encontraría la fila y el guardado se perdería.
    const primera = nextBoardVersion(AHORA_ISO, AHORA_MS);
    const segunda = nextBoardVersion(primera, AHORA_MS);
    expect(Date.parse(segunda)).toBeGreaterThan(Date.parse(primera));
  });
});

describe('board-serialization: comparación de versiones', () => {
  it('isSameVersion reconoce la misma fecha aunque el formato cambie', () => {
    expect(isSameVersion(AHORA_ISO, AHORA_ISO)).toBe(true);
    expect(isSameVersion(AHORA_ISO, '2026-06-01T14:00:00.000+02:00')).toBe(true);
    expect(isSameVersion(AHORA_ISO, '2026-06-01T12:00:00.500Z')).toBe(false);
  });

  it('isSameVersion sin versión conocida nunca considera iguales', () => {
    expect(isSameVersion(AHORA_ISO, null)).toBe(false);
  });

  it('isSameVersion con fechas inválidas no lanza y no las trata como iguales', () => {
    expect(isSameVersion('', '')).toBe(false);
    expect(isSameVersion('no-es-fecha', 'tampoco')).toBe(false);
    expect(isSameVersion(AHORA_ISO, 'no-es-fecha')).toBe(false);
  });

  it('isNewerVersion solo acepta lo estrictamente más nuevo', () => {
    expect(isNewerVersion(new Date(AHORA_MS + 1000).toISOString(), AHORA_ISO)).toBe(true);
    expect(isNewerVersion(AHORA_ISO, AHORA_ISO)).toBe(false);
    expect(isNewerVersion(new Date(AHORA_MS - 1000).toISOString(), AHORA_ISO)).toBe(false);
  });

  it('isNewerVersion sin versión conocida acepta cualquiera', () => {
    // Es el caso de un tablero que se acaba de crear: no hay nada con qué comparar.
    expect(isNewerVersion(AHORA_ISO, null)).toBe(true);
    expect(isNewerVersion('no-es-fecha', null)).toBe(true);
  });

  it('isNewerVersion con fechas inválidas no lanza y rechaza', () => {
    // Una fila remota con updated_at ilegible no debe pisar lo que ya se tiene.
    expect(isNewerVersion('', AHORA_ISO)).toBe(false);
    expect(isNewerVersion('no-es-fecha', 'tampoco')).toBe(false);
  });
});
