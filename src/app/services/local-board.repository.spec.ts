import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalBoardRepository } from './local-board.repository';
import type { ChecklistBoard } from '../models/board.model';

/**
 * Pruebas del repositorio local (localStorage).
 *
 * El repositorio lee y escribe en el `localStorage` global, que no existe al correr
 * pruebas. En vez de tocar el código de producción para inyectarlo, se sustituye el
 * global con `vi.stubGlobal`: el repositorio sigue usando exactamente el mismo código.
 */

/** Claves que usa el repositorio. */
const CLAVE_BASE = 'the-lister-ionic-v1';
const claveUsuario = (userId: string): string => `${CLAVE_BASE}:${userId}`;

/** localStorage falso en memoria, con la misma forma que el de verdad. */
const fakeLocalStorage = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string): string | null => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string): void => {
      data.set(key, String(value));
    },
    removeItem: (key: string): void => {
      data.delete(key);
    }
  };
};

/** localStorage que falla siempre: modo privado o WebView sin almacenamiento. */
const localStorageRoto = (): Storage => ({
  getItem() {
    throw new Error('SecurityError: storage is not available');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
  removeItem() {
    throw new Error('SecurityError: storage is not available');
  },
  clear() {
    throw new Error('SecurityError: storage is not available');
  },
  key() {
    return null;
  },
  length: 0
} as Storage);

/** Tablero mínimo de prueba. */
const tablero = (id: string, lists: ChecklistBoard['lists'] = []): ChecklistBoard => ({
  id,
  title: `Tablero ${id}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  lists
});

/** Fecha fija, para que el `createdAt` del tablero por defecto sea determinista. */
const FECHA_FIJA = new Date('2026-06-01T12:00:00.000Z');

/** Recoge todo lo que emite `watchBoard()` desde el momento de la suscripción. */
const suscribir = (repo: LocalBoardRepository): ChecklistBoard[] => {
  const emisiones: ChecklistBoard[] = [];
  repo.watchBoard().subscribe((board) => emisiones.push(board));
  return emisiones;
};

/**
 * Valor actual del tablero. `watchBoard()` devuelve un Observable, pero por dentro es un
 * BehaviorSubject: al suscribirse emite sincrónicamente el último valor conocido.
 */
const valorActual = (repo: LocalBoardRepository): ChecklistBoard => {
  let ultimo: ChecklistBoard | undefined;
  repo.watchBoard().subscribe((board) => (ultimo = board));
  return ultimo!;
};

describe('LocalBoardRepository', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeLocalStorage());
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FECHA_FIJA);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('initializeForUser: elección de clave', () => {
    it('sin usuario guarda y lee de la clave base', async () => {
      const repo = new LocalBoardRepository();
      await repo.initializeForUser(null);

      await repo.saveBoard(tablero('local'));

      const almacen = localStorage as unknown as ReturnType<typeof fakeLocalStorage>;
      expect(almacen.data.has(CLAVE_BASE)).toBe(true);
      expect(almacen.data.has(claveUsuario('user-1'))).toBe(false);
    });

    it('con usuario guarda y lee de la clave de ese usuario', async () => {
      const repo = new LocalBoardRepository();
      await repo.initializeForUser('user-1');

      await repo.saveBoard(tablero('de-user-1'));

      const almacen = localStorage as unknown as ReturnType<typeof fakeLocalStorage>;
      expect(almacen.data.has(claveUsuario('user-1'))).toBe(true);
      // La clave base no se toca: cada cuenta tiene su propio tablero.
      expect(almacen.data.has(CLAVE_BASE)).toBe(false);
    });

    it('cambiar de usuario cambia de clave y por tanto de tablero', async () => {
      const repo = new LocalBoardRepository();

      await repo.initializeForUser('user-1');
      await repo.saveBoard(tablero('de-user-1'));

      await repo.initializeForUser('user-2');
      // El usuario 2 no tiene nada guardado: arranca con el tablero vacío por defecto.
      expect(valorActual(repo).id).not.toBe('de-user-1');
      expect(valorActual(repo).lists).toEqual([]);
    });
  });

  describe('saveBoard: escritura', () => {
    it('guarda el tablero como JSON en la clave activa', async () => {
      const repo = new LocalBoardRepository();
      await repo.initializeForUser(null);

      const board = tablero('guardado');
      await repo.saveBoard(board);

      const almacen = localStorage as unknown as ReturnType<typeof fakeLocalStorage>;
      expect(JSON.parse(almacen.data.get(CLAVE_BASE)!)).toEqual(board);
    });

    it('emite una copia: modificar lo emitido no altera lo guardado', async () => {
      const repo = new LocalBoardRepository();
      await repo.initializeForUser(null);
      const emisiones = suscribir(repo);

      const board = tablero('original');
      await repo.saveBoard(board);

      const emitido = emisiones.at(-1)!;
      // Es otra referencia, no el mismo objeto que se pasó.
      expect(emitido).not.toBe(board);
      // Mutar la copia emitida no cambia el JSON que quedó en disco.
      emitido.title = 'Título cambiado en memoria';
      emitido.lists.push({
        id: 'l1',
        boardId: 'original',
        title: 'Lista fantasma',
        position: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        tasks: []
      });

      const almacen = localStorage as unknown as ReturnType<typeof fakeLocalStorage>;
      const guardado = JSON.parse(almacen.data.get(CLAVE_BASE)!);
      expect(guardado.title).toBe('Tablero original');
      expect(guardado.lists).toEqual([]);
    });

    it('releer tras guardar devuelve el mismo tablero', async () => {
      const repo = new LocalBoardRepository();
      await repo.initializeForUser(null);

      const board = tablero('ida-y-vuelta');
      await repo.saveBoard(board);

      await repo.refresh();
      expect(valorActual(repo)).toEqual(board);
    });

    it('sin initializeForUser guarda en la clave base', async () => {
      // El repositorio arranca con la clave base antes de saber si hay usuario.
      const repo = new LocalBoardRepository();
      await repo.saveBoard(tablero('sin-inicializar'));

      const almacen = localStorage as unknown as ReturnType<typeof fakeLocalStorage>;
      expect(almacen.data.has(CLAVE_BASE)).toBe(true);
    });
  });

  describe('getStoredBoardForUser: semilla del primer ingreso', () => {
    it('encuentra el tablero por usuario', async () => {
      const almacen = localStorage as unknown as ReturnType<typeof fakeLocalStorage>;
      almacen.data.set(claveUsuario('user-1'), JSON.stringify(tablero('de-user-1')));
      almacen.data.set(CLAVE_BASE, JSON.stringify(tablero('compartido')));
      const repo = new LocalBoardRepository();

      expect(repo.getStoredBoardForUser('user-1')?.id).toBe('de-user-1');
    });

    it('cae a la clave base si el usuario no tiene tablero', async () => {
      // La clave base es la semilla: sirve para el primer ingreso de cualquier cuenta.
      const almacen = localStorage as unknown as ReturnType<typeof fakeLocalStorage>;
      almacen.data.set(CLAVE_BASE, JSON.stringify(tablero('compartido')));
      const repo = new LocalBoardRepository();

      expect(repo.getStoredBoardForUser('user-9')?.id).toBe('compartido');
    });

    it('devuelve null si no hay nada guardado', () => {
      const repo = new LocalBoardRepository();
      expect(repo.getStoredBoardForUser('user-1')).toBeNull();
    });
  });

  describe('datos corruptos o antiguos', () => {
    it('JSON inválido en la clave activa da tablero vacío y avisa, sin lanzar', async () => {
      const almacen = localStorage as unknown as ReturnType<typeof fakeLocalStorage>;
      almacen.data.set(CLAVE_BASE, '{esto no es JSON');
      const repo = new LocalBoardRepository();
      await repo.initializeForUser(null);

      expect(valorActual(repo).lists).toEqual([]);
      expect(console.warn).toHaveBeenCalled();
    });

    it('JSON inválido en la clave del usuario hace que la semilla caiga a la base', () => {
      const almacen = localStorage as unknown as ReturnType<typeof fakeLocalStorage>;
      almacen.data.set(claveUsuario('user-1'), '{roto');
      almacen.data.set(CLAVE_BASE, JSON.stringify(tablero('compartido')));
      const repo = new LocalBoardRepository();

      expect(repo.getStoredBoardForUser('user-1')?.id).toBe('compartido');
    });

    it('JSON corrupto en las dos claves devuelve null y no lanza', () => {
      const almacen = localStorage as unknown as ReturnType<typeof fakeLocalStorage>;
      almacen.data.set(claveUsuario('user-1'), '{roto');
      almacen.data.set(CLAVE_BASE, 'tampoco');
      const repo = new LocalBoardRepository();

      expect(repo.getStoredBoardForUser('user-1')).toBeNull();
    });

    it('un tablero antiguo sin pin, basurero ni archivo carga tal cual', async () => {
      // Los campos nuevos son opcionales justamente para que estos tableros sigan cargando.
      const almacen = localStorage as unknown as ReturnType<typeof fakeLocalStorage>;
      almacen.data.set(CLAVE_BASE, JSON.stringify(tablero('antiguo')));
      const repo = new LocalBoardRepository();
      await repo.initializeForUser(null);

      const board = valorActual(repo);
      expect(board.id).toBe('antiguo');
      expect(board.pinnedListId).toBeUndefined();
      expect(board.trashedLists).toBeUndefined();
      expect(board.archivedLists).toBeUndefined();
    });
  });

  describe('tablero vacío por defecto', () => {
    it('sin nada guardado arranca con id UUID, título "Mi tablero" y sin listas', async () => {
      const uuidEspia = vi
        .spyOn(globalThis.crypto, 'randomUUID')
        .mockReturnValue('11111111-1111-4111-8111-111111111111');
      const repo = new LocalBoardRepository();
      await repo.initializeForUser(null);

      const board = valorActual(repo);
      expect(uuidEspia).toHaveBeenCalled();
      expect(board.id).toBe('11111111-1111-4111-8111-111111111111');
      expect(board.title).toBe('Mi tablero');
      expect(board.lists).toEqual([]);
      // La fecha sale del reloj del sistema, aquí congelado.
      expect(board.createdAt).toBe('2026-06-01T12:00:00.000Z');
    });
  });

  describe('localStorage que lanza (modo privado)', () => {
    it('leer no rompe: el tablero por defecto se construye igual', async () => {
      vi.stubGlobal('localStorage', localStorageRoto());
      const repo = new LocalBoardRepository();
      await repo.initializeForUser(null);

      expect(valorActual(repo).title).toBe('Mi tablero');
      expect(valorActual(repo).lists).toEqual([]);
      expect(console.warn).toHaveBeenCalled();
    });

    it('getStoredBoardForUser devuelve null en vez de reventar', () => {
      vi.stubGlobal('localStorage', localStorageRoto());
      const repo = new LocalBoardRepository();
      expect(repo.getStoredBoardForUser('user-1')).toBeNull();
    });

    /**
     * Comportamiento actual, documentado tal cual: `saveBoard` NO envuelve el `setItem`,
     * así que en un entorno sin almacenamiento la promesa RECHAZA (aquí con
     * QuotaExceededError, el error que lanza el mock al escribir). No revienta la app
     * porque quien guarda (las páginas) ya captura el error y muestra el aviso de
     * "no se pudieron guardar los cambios", pero es asimétrico con la lectura, que sí
     * degrada. Ver el informe: no se cambia aquí.
     */
    it('escribir rechaza la promesa si localStorage falla', async () => {
      vi.stubGlobal('localStorage', localStorageRoto());
      const repo = new LocalBoardRepository();
      await repo.initializeForUser(null);

      await expect(repo.saveBoard(tablero('x'))).rejects.toThrow(/Error/);
    });
  });
});
