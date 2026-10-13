import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { BoardMergeConflictError } from '../board-merge';
import { moveListBefore, moveListByOffset } from '../board-list-rules';
import { setSessionBlockedFlag } from '../session-guard';
import { SupabaseBoardRepository } from './supabase-board.repository';
import { AuthService } from './auth.service';
import { fakeSession, fakeSupabase, type FakeSupabase } from './testing/fake-supabase';
import type { ChecklistBoard } from '../../models/board.models';

/**
 * Pruebas del repositorio sincronizado (Supabase).
 *
 * Se usa un cliente de Supabase falso (ver `testing/fake-supabase.ts`), así que no hay red
 * ni credenciales: solo se comprueba la lógica de versiones, el merge y los conflictos.
 */

const USUARIO = 'user-1';

/** Reloj congelado: las versiones `updated_at` salen de aquí y salen deterministas. */
const AHORA = new Date('2026-06-01T12:00:00.000Z');
const AHORA_ISO = AHORA.toISOString();
const VERSION_ANTERIOR = new Date(AHORA.getTime() - 60_000).toISOString();
const VERSION_POSTERIOR = new Date(AHORA.getTime() + 60_000).toISOString();

/** Tablero guardado en la nube, con una lista y una tarea. */
const tableroRemoto = (): ChecklistBoard => ({
  id: 'board-remoto',
  title: 'Mi tablero',
  createdAt: '2026-01-01T00:00:00.000Z',
  lists: [
    {
      id: 'lista-1',
      boardId: 'board-remoto',
      title: 'Compra',
      position: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      tasks: [
        {
          id: 'tarea-1',
          listId: 'lista-1',
          text: 'Leche',
          completed: false,
          position: 0,
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ]
    }
  ]
});

/** Fila de la tabla `boards` con el tablero dentro de `board_data`. */
const fila = (board: ChecklistBoard, updatedAt = AHORA_ISO) => ({
  id: board.id,
  title: board.title,
  created_at: board.createdAt,
  updated_at: updatedAt,
  board_data: board
});

/** Monta el repositorio con un cliente falso y una sesión controlable. */
const montar = (supabase: FakeSupabase) => {
  const sessionChanges = new Subject<ReturnType<typeof fakeSession>>();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      SupabaseBoardRepository,
      { provide: AuthService, useValue: {
          enabled: true,
          session: fakeSession(USUARIO),
          sessionChanges: sessionChanges.asObservable(),
          supabaseClient: supabase.cliente
        } as unknown as AuthService }
    ]
  });
  const repo = TestBed.inject(SupabaseBoardRepository);
  return { repo, sessionChanges };
};

/** Valor emitido ahora mismo por el repositorio. */
const valorActual = (repo: SupabaseBoardRepository): ChecklistBoard => {
  let ultimo: ChecklistBoard | undefined;
  repo.watchBoard().subscribe((b) => (ultimo = b));
  return ultimo!;
};

/** Todos los valores que ha emitido el repositorio, en orden. */
const emisiones = (repo: SupabaseBoardRepository): ChecklistBoard[] => {
  const historial: ChecklistBoard[] = [];
  repo.watchBoard().subscribe((b) => historial.push(b));
  return historial;
};

/** ¿Cuántas búsquedas de red se han hecho? */
const busquedas = (s: FakeSupabase): number =>
  s.llamadas.filter((l) => l.startsWith('maybeSingle:select')).length;

describe('SupabaseBoardRepository', () => {
  beforeEach(() => {
    setSessionBlockedFlag(null);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // El entorno de pruebas es "web": así el repositorio usa listeners de documento.
    vi.spyOn(document, 'addEventListener');
    vi.spyOn(document, 'removeEventListener');
    vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    setSessionBlockedFlag(null);
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('initializeForUser', () => {
    it('con fila existente la publica y arranca la sincronización', async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto(), VERSION_ANTERIOR) });
      const { repo } = montar(s);

      await repo.initializeForUser(USUARIO);

      expect(valorActual(repo)).toEqual(tableroRemoto());
      // Primero se autoriza el canal, luego se busca la fila y se suscribe realtime.
      expect(s.llamadas).toContain('realtime.setAuth:token-de-prueba');
      expect(busquedas(s)).toBe(1);
      expect(s.suscrito).toBe(true);
    });

    it('sin fila inserta usando la semilla local con id y fecha nuevos', async () => {
      const s = fakeSupabase({ fila: null, filaInsertada: fila(tableroRemoto(), AHORA_ISO) });
      const { repo } = montar(s);

      // Semilla: un tablero local recién creado, sin id ni fecha.
      // Semilla incompleta a propósito: el repositorio debe rellenarle el id y la fecha.
      const semilla = { title: '', createdAt: '', lists: [] } as unknown as ChecklistBoard;
      await repo.initializeForUser(USUARIO, semilla);

      expect(s.insertado).not.toBeNull();
      expect(s.insertado!['owner_id']).toBe(USUARIO);
      expect(s.insertado!['title']).toBe('Mi tablero'); // se rellena el título por defecto
      expect(s.insertado!['created_at']).toBe(AHORA_ISO); // y la fecha, con el reloj congelado
      const boardData = s.insertado!['board_data'] as ChecklistBoard;
      expect(boardData.id).not.toBe(''); // id nuevo
      expect(boardData.createdAt).toBe(AHORA_ISO);
      // La fila devuelta por el insert es la que se publica.
      expect(valorActual(repo).id).toBe('board-remoto');
    });

    it('un 23505 (otra pestaña creó la fila antes) relee y publica la existente', async () => {
      const existente = fila(tableroRemoto(), AHORA_ISO);
      // Primera búsqueda: aún no hay fila. Tras el 23505 del insert, la relectura sí la ve.
      const s = fakeSupabase({
        fila: (numero) => (numero === 0 ? null : existente),
        errorInsert: { code: '23505', message: 'duplicate' }
      });
      const { repo } = montar(s);

      await repo.initializeForUser(USUARIO, tableroRemoto());

      // No se lanza: se recupera la fila concurrente y se sigue con ella.
      expect(valorActual(repo)).toEqual(tableroRemoto());
      expect(busquedas(s)).toBe(2); // la inicial (vacía) + la relectura
    });

    it('un 23505 sin fila que recuperar sí lanza', async () => {
      const s = fakeSupabase({ fila: null, errorInsert: { code: '23505', message: 'duplicate' } });
      const { repo } = montar(s);

      await expect(repo.initializeForUser(USUARIO, tableroRemoto())).rejects.toThrow(/duplicate/);
    });

    it('cualquier otro error de inserción lanza', async () => {
      const s = fakeSupabase({ fila: null, errorInsert: { code: '42P01', message: 'tabla inexistente' } });
      const { repo } = montar(s);

      await expect(repo.initializeForUser(USUARIO, tableroRemoto())).rejects.toThrow(/tabla inexistente/);
    });

    it('sin usuario lanza y no toca la red', async () => {
      const s = fakeSupabase();
      const { repo } = montar(s);

      await expect(repo.initializeForUser(null)).rejects.toThrow(/Inicia sesión/);
      expect(s.llamadas).toEqual([]);
    });

    it('con la pestaña bloqueada no se hace ninguna llamada de red', async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto()) });
      const { repo } = montar(s);
      setSessionBlockedFlag('signed-out');

      await expect(repo.initializeForUser(USUARIO)).rejects.toThrow(/sesión cambió en otra pestaña/i);
      expect(s.llamadas).toEqual([]);
    });

    it('repetir la inicialización del mismo usuario no vuelve a la red', async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto(), VERSION_ANTERIOR) });
      const { repo } = montar(s);

      await repo.initializeForUser(USUARIO);
      await repo.initializeForUser(USUARIO);

      expect(busquedas(s)).toBe(1);
    });
  });

  describe('saveBoard', () => {
    it('si la versión coincide, actualiza directo y emite el tablero', async () => {
      const remoto = tableroRemoto();
      const s = fakeSupabase({
        fila: fila(remoto, VERSION_ANTERIOR),
        filaActualizada: { updated_at: AHORA_ISO }
      });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);

      const editado = structuredClone(remoto);
      editado.lists[0].title = 'Compra semanal';
      const historial = emisiones(repo);
      await repo.saveBoard(editado);

      expect(s.llamadas).toContain('boards.update');
      // El filtro por versión es el que hace el guardado optimista.
      expect(s.llamadas).toContain(`eq:updated_at:${VERSION_ANTERIOR}`);
      expect(s.actualizado!['updated_at']).toBe(AHORA_ISO);
      expect(historial.at(-1)!.lists[0].title).toBe('Compra semanal');
      // Sin conflicto: el merge no entra.
      expect(s.llamadas.filter((l) => l === 'boards.update').length).toBe(1);
    });

    /**
     * Reordenar las listas escribe `position` (y recoloca el array), pero no es una edición
     * de contenido: si nadie más ha tocado el tablero, el guardado optimista casa y el
     * merge no llega a entrar. Sin esto cualquier reorden parecería un cambio divergente.
     */
    it('un reorden de listas guarda directo, sin fusionar', async () => {
      const remoto = tableroRemoto();
      remoto.lists.push({
        id: 'lista-2',
        boardId: 'board-remoto',
        title: 'Casa',
        position: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        tasks: []
      });
      const s = fakeSupabase({
        fila: fila(remoto, VERSION_ANTERIOR),
        filaActualizada: { updated_at: AHORA_ISO }
      });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);

      const local = structuredClone(remoto);
      // «Casa» pasa delante de «Compra»: se reescriben las dos posiciones.
      moveListBefore(local, 'lista-2', 'lista-1');
      const conflictos: unknown[] = [];
      repo.conflict$.subscribe((c) => {
        if (c) conflictos.push(c);
      });
      await repo.saveBoard(local);

      expect(conflictos).toEqual([]);
      // Un solo update: el merge no entra.
      expect(s.llamadas.filter((l) => l === 'boards.update').length).toBe(1);
      const datos = s.actualizado!['board_data'] as ChecklistBoard;
      expect(datos.lists.map((l) => l.id)).toEqual(['lista-2', 'lista-1']);
      expect(datos.lists.map((l) => l.position)).toEqual([0, 1]);
    });

    /**
     * Con la versión remota movida sí se intenta fusionar, y un reorden NO es una adición:
     * sale el conflicto de siempre para que el usuario elija. Es el comportamiento aceptado
     * cuando dos dispositivos reordenan sobre copias distintas.
     */
    it('un reorden sobre una copia remota distinta publica conflicto', async () => {
      const remoto = tableroRemoto();
      remoto.lists.push({
        id: 'lista-2',
        boardId: 'board-remoto',
        title: 'Casa',
        position: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        tasks: []
      });
      const s = fakeSupabase({
        fila: fila(remoto, VERSION_ANTERIOR),
        filaActualizada: null
      });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);

      // Local: reordena (aquí con el teclado: una posición arriba). Remoto: ha añadido una
      // tarea, así que la versión se movió y el merge entra.
      const local = structuredClone(remoto);
      moveListByOffset(local, 'lista-2', -1);
      const remotoMasNuevo = structuredClone(remoto);
      remotoMasNuevo.lists[0].tasks.push({
        id: 'tarea-remota',
        listId: 'lista-1',
        text: 'Huevos',
        completed: false,
        position: 1,
        createdAt: '2026-01-01T00:00:00.000Z'
      });
      s.opciones.fila = fila(remotoMasNuevo, VERSION_POSTERIOR);

      const conflictos: { reason: string }[] = [];
      repo.conflict$.subscribe((c) => {
        if (c) conflictos.push(c);
      });
      await expect(repo.saveBoard(local)).rejects.toThrow(BoardMergeConflictError);

      expect(conflictos.length).toBe(1);
      expect(conflictos[0].reason).toMatch(/editadas|reordenadas/i);
      // El tablero local reordenado es el que se ofrece en el diálogo.
      const conflicto = conflictos[0] as unknown as { localBoard: ChecklistBoard };
      expect(conflicto.localBoard.lists.map((l) => l.id)).toEqual(['lista-2', 'lista-1']);
    });

    it('si la versión no coincide, fusiona adiciones y reintenta', async () => {
      const remoto = tableroRemoto();
      // El primer guardado no casa (la fila se movió), el reintento ya sí.
      const s = fakeSupabase({
        fila: fila(remoto, VERSION_ANTERIOR),
        filaActualizada: (numero) => (numero === 0 ? null : { updated_at: VERSION_POSTERIOR })
      });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);

      // Cambio local: una tarea nueva en la lista existente (una adición, fusionable).
      const local = structuredClone(remoto);
      local.lists[0].tasks.push({
        id: 'tarea-nueva',
        listId: 'lista-1',
        text: 'Pan',
        completed: false,
        position: 1,
        createdAt: AHORA_ISO
      });
      // Cambio remoto: otra tarea añadida desde otro dispositivo.
      const remotoMasNuevo = structuredClone(remoto);
      remotoMasNuevo.lists[0].tasks.push({
        id: 'tarea-remota',
        listId: 'lista-1',
        text: 'Huevos',
        completed: false,
        position: 1,
        createdAt: AHORA_ISO
      });
      s.opciones.fila = fila(remotoMasNuevo, VERSION_POSTERIOR);

      await repo.saveBoard(local);

      // Dos updates: el que falló y el reintento ya fusionado.
      expect(s.llamadas.filter((l) => l === 'boards.update').length).toBe(2);
      expect(s.llamadas).toContain(`eq:updated_at:${VERSION_ANTERIOR}`);
      expect(s.llamadas).toContain(`eq:updated_at:${VERSION_POSTERIOR}`);
      // El reintento lleva las dos tareas: la local y la remota.
      const datos = s.actualizado!['board_data'] as ChecklistBoard;
      expect(datos.lists[0].tasks.map((t) => t.id)).toEqual([
        'tarea-1',
        'tarea-remota',
        'tarea-nueva'
      ]);
    });

    /**
     * Dos dispositivos añaden tareas distintas a la MISMA lista. La lista local lleva su
     * `updatedAt` recién escrito: eso no puede convertir la fusión en un conflicto.
     */
    it('dos dispositivos con tareas distintas en la misma lista fusionan aunque el local tenga updatedAt', async () => {
      const remoto = tableroRemoto();
      const s = fakeSupabase({
        fila: fila(remoto, VERSION_ANTERIOR),
        filaActualizada: (numero) => (numero === 0 ? null : { updated_at: VERSION_POSTERIOR })
      });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);

      const local = structuredClone(remoto);
      local.lists[0].updatedAt = '2026-01-05T10:00:00.000Z';
      local.lists[0].tasks.push({
        id: 'tarea-nueva',
        listId: 'lista-1',
        text: 'Pan',
        completed: false,
        position: 1,
        createdAt: AHORA_ISO
      });

      const remotoMasNuevo = structuredClone(remoto);
      remotoMasNuevo.lists[0].updatedAt = '2026-01-04T09:00:00.000Z';
      remotoMasNuevo.lists[0].tasks.push({
        id: 'tarea-remota',
        listId: 'lista-1',
        text: 'Huevos',
        completed: false,
        position: 1,
        createdAt: AHORA_ISO
      });
      s.opciones.fila = fila(remotoMasNuevo, VERSION_POSTERIOR);

      const conflictos: unknown[] = [];
      repo.conflict$.subscribe((c) => {
        if (c) conflictos.push(c);
      });
      await repo.saveBoard(local);

      // Sin conflicto: el merge entra y gana la fecha más reciente de las dos.
      expect(conflictos).toEqual([]);
      expect(s.llamadas.filter((l) => l === 'boards.update').length).toBe(2);
      const datos = s.actualizado!['board_data'] as ChecklistBoard;
      expect(datos.lists[0].tasks.map((t) => t.id)).toEqual([
        'tarea-1',
        'tarea-remota',
        'tarea-nueva'
      ]);
      expect(datos.lists[0].updatedAt).toBe('2026-01-05T10:00:00.000Z');
    });

    it('si las adiciones no se pueden fusionar, publica conflicto y lanza', async () => {
      const remoto = tableroRemoto();
      const s = fakeSupabase({ fila: fila(remoto, VERSION_ANTERIOR), filaActualizada: null });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);

      // Misma tarea editada de forma distinta en los dos sitios: no es una adición.
      const local = structuredClone(remoto);
      local.lists[0].tasks[0].text = 'Leche desnatada';
      const remotoEditado = structuredClone(remoto);
      remotoEditado.lists[0].tasks[0].text = 'Leche entera';
      s.opciones.fila = fila(remotoEditado, VERSION_POSTERIOR);

      const conflictos: unknown[] = [];
      repo.conflict$.subscribe((c) => conflictos.push(c));
      await expect(repo.saveBoard(local)).rejects.toThrow(BoardMergeConflictError);

      const conflicto = conflictos.at(-1) as { localBoard: ChecklistBoard; remoteBoard: ChecklistBoard };
      expect(conflicto.localBoard.lists[0].tasks[0].text).toBe('Leche desnatada');
      expect(conflicto.remoteBoard.lists[0].tasks[0].text).toBe('Leche entera');
    });

    it('si el reintento también falla, publica el conflicto con la última versión', async () => {
      const remoto = tableroRemoto();
      const s = fakeSupabase({ fila: fila(remoto, VERSION_ANTERIOR), filaActualizada: null });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);

      const local = structuredClone(remoto);
      local.lists[0].tasks.push({
        id: 'tarea-nueva',
        listId: 'lista-1',
        text: 'Pan',
        completed: false,
        position: 1,
        createdAt: AHORA_ISO
      });
      const remotoMasNuevo = structuredClone(remoto);
      remotoMasNuevo.lists[0].title = 'Renombrada en remoto';
      s.opciones.fila = fila(remotoMasNuevo, VERSION_POSTERIOR);
      // El reintento tampoco casa: el tablero cambió otra vez mientras se guardaba.
      s.opciones.filaActualizada = null;

      await expect(repo.saveBoard(local)).rejects.toThrow(BoardMergeConflictError);
      // Se buscó la última versión para mostrar el conflicto con lo más reciente.
      expect(busquedas(s)).toBeGreaterThanOrEqual(2);
    });

    it('sin tablero sincronizado previo, el error lo dice claro', async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto()) });
      const { repo } = montar(s);

      // Sin haber inicializado no hay versión base con la que comparar.
      await expect(repo.saveBoard(tableroRemoto())).rejects.toThrow(
        /No hay una versión sincronizada/
      );
    });

    it('con la pestaña bloqueada rechaza sin tocar la red', async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto(), VERSION_ANTERIOR), filaActualizada: { updated_at: AHORA_ISO } });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);
      const llamadasAntes = s.llamadas.length;
      setSessionBlockedFlag('other-account');

      await expect(repo.saveBoard(tableroRemoto())).rejects.toThrow(
        /sesión cambió en otra pestaña/i
      );
      expect(s.llamadas.length).toBe(llamadasAntes);
    });
  });

  describe('refresh y handleBoardChange', () => {
    it('ignora una versión más vieja o igual que la conocida', async () => {
      const remoto = tableroRemoto();
      const s = fakeSupabase({ fila: fila(remoto, AHORA_ISO) });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);

      s.opciones.fila = fila(remoto, VERSION_ANTERIOR);
      await repo.refresh();
      const historial = emisiones(repo);
      expect(valorActual(repo)).toEqual(remoto);

      s.opciones.fila = fila(remoto, AHORA_ISO); // igual
      await repo.refresh();
      expect(historial.length).toBe(1); // no ha vuelto a emitir
    });

    it('aplica la versión más nueva', async () => {
      const remoto = tableroRemoto();
      const s = fakeSupabase({ fila: fila(remoto, VERSION_ANTERIOR) });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);

      const remotoNuevo = structuredClone(remoto);
      remotoNuevo.lists[0].title = 'Cambio de otro dispositivo';
      s.opciones.fila = fila(remotoNuevo, VERSION_POSTERIOR);
      await repo.refresh();

      expect(valorActual(repo).lists[0].title).toBe('Cambio de otro dispositivo');
    });

    it('los refrescos solapados comparten la misma promesa y una sola búsqueda', async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto(), VERSION_ANTERIOR) });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);
      const busquedasAntes = busquedas(s);

      const primero = repo.refresh();
      const segundo = repo.refresh();
      await Promise.all([primero, segundo]);

      // Aunque cada llamada devuelva su propia promesa (es una función async), por
      // debajo solo se lanza UNA consulta: la segunda reutiliza la que está en vuelo.
      expect(busquedas(s)).toBe(busquedasAntes + 1);
    });

    it('un cambio igual al conocido no dispara refresco', async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto(), AHORA_ISO) });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);
      const busquedasAntes = busquedas(s);

      s.emitirCambio({ id: 'board-remoto', updated_at: AHORA_ISO });
      await Promise.resolve();

      expect(busquedas(s)).toBe(busquedasAntes);
    });

    it('un cambio más nuevo sí dispara el refresco', async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto(), VERSION_ANTERIOR) });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);
      const busquedasAntes = busquedas(s);

      s.emitirCambio({ id: 'board-remoto', updated_at: VERSION_POSTERIOR });
      await Promise.resolve();
      await Promise.resolve();

      expect(busquedas(s)).toBe(busquedasAntes + 1);
    });

    it('un cambio sin versión se ignora', async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto(), VERSION_ANTERIOR) });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);
      const busquedasAntes = busquedas(s);

      s.emitirCambio({ id: 'board-remoto' });
      await Promise.resolve();

      expect(busquedas(s)).toBe(busquedasAntes);
    });

    it('el eco de la propia escritura no se confunde con un cambio remoto', async () => {
      const remoto = tableroRemoto();
      const s = fakeSupabase({
        fila: fila(remoto, VERSION_ANTERIOR),
        filaActualizada: { updated_at: AHORA_ISO },
        ecoPropioEnUpdate: true
      });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);
      const busquedasAntes = busquedas(s);

      // Al guardar, el canal devuelve el mismo cambio que se acaba de escribir.
      await repo.saveBoard(remoto);
      await Promise.resolve();
      await Promise.resolve();

      // Sin el filtro de `pendingWriteVersion` esto habría lanzado un refresco de más.
      expect(busquedas(s)).toBe(busquedasAntes);
    });

    it('el refresco automático tiene un margen de 3 segundos', async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto(), VERSION_ANTERIOR) });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);

      s.emitirCambio({ id: 'board-remoto', updated_at: VERSION_POSTERIOR });
      await Promise.resolve();
      await Promise.resolve();
      const busquedasAntes = busquedas(s);

      // Otro cambio inmediato: dentro del margen, se descarta.
      s.emitirCambio({ id: 'board-remoto', updated_at: new Date(AHORA.getTime() + 120_000).toISOString() });
      await Promise.resolve();
      await Promise.resolve();
      expect(busquedas(s)).toBe(busquedasAntes);

      // Pasados los 3 segundos ya se refresca.
      vi.setSystemTime(new Date(AHORA.getTime() + 4000));
      s.emitirCambio({ id: 'board-remoto', updated_at: new Date(AHORA.getTime() + 180_000).toISOString() });
      await Promise.resolve();
      await Promise.resolve();
      expect(busquedas(s)).toBe(busquedasAntes + 1);
    });

    /**
     * BUG-10 (descartado): `isNewerVersion` acepta cualquier cosa cuando no hay versión
     * conocida. Eso solo es alcanzable cuando `userId` también es null, porque el reseteo
     * por cambio de sesión pone los dos a la vez; y en ese estado `refresh()` sale antes
     * de comparar, así que no hay memoria local a la que dar marcha atrás.
     */
    it('tras un cambio de sesión se olvida del tablero y no refresca nada', async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto(), VERSION_ANTERIOR) });
      const { repo, sessionChanges } = montar(s);
      await repo.initializeForUser(USUARIO);
      const busquedasAntes = busquedas(s);

      // El Subject está tipado como Session; el null es el caso real de "sin sesión".
      sessionChanges.next(null as unknown as ReturnType<typeof fakeSession>);
      await repo.refresh();

      expect(busquedas(s)).toBe(busquedasAntes);
    });

    it('con un conflicto pendiente, el refresco actualiza la versión remota del conflicto', async () => {
      const remoto = tableroRemoto();
      const s = fakeSupabase({ fila: fila(remoto, VERSION_ANTERIOR), filaActualizada: null });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);

      // Se provoca un conflicto con una edición divergente.
      const local = structuredClone(remoto);
      local.lists[0].tasks[0].text = 'Leche desnatada';
      const remotoEditado = structuredClone(remoto);
      remotoEditado.lists[0].tasks[0].text = 'Leche entera';
      s.opciones.fila = fila(remotoEditado, VERSION_POSTERIOR);
      await expect(repo.saveBoard(local)).rejects.toThrow(BoardMergeConflictError);

      // Llega una versión aún más nueva: el conflicto debe renovar su copia remota.
      const remotoMasNuevo = structuredClone(remotoEditado);
      remotoMasNuevo.lists[0].tasks[0].text = 'Leche de almendras';
      s.opciones.fila = fila(remotoMasNuevo, new Date(AHORA.getTime() + 180_000).toISOString());
      await repo.refresh();

      const conflictos: { remoteBoard: ChecklistBoard }[] = [];
      repo.conflict$.subscribe((c) => conflictos.push(c as never));
      const conflicto = conflictos.at(-1)!;
      expect(conflicto.remoteBoard.lists[0].tasks[0].text).toBe('Leche de almendras');
    });
  });

  describe('resolveConflict', () => {
    /** Prepara un conflicto real entre el tablero base y una edición divergente remota. */
    const prepararConflicto = async (repo: SupabaseBoardRepository, s: FakeSupabase) => {
      const remoto = tableroRemoto();
      const local = structuredClone(remoto);
      local.lists[0].tasks[0].text = 'Leche desnatada';
      const remotoEditado = structuredClone(remoto);
      remotoEditado.lists[0].tasks[0].text = 'Leche entera';
      s.opciones.fila = fila(remotoEditado, VERSION_POSTERIOR);
      await expect(repo.saveBoard(local)).rejects.toThrow(BoardMergeConflictError);
      return { local, remotoEditado };
    };

    it("'remote' adopta el tablero remoto y cierra el conflicto", async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto(), VERSION_ANTERIOR), filaActualizada: null });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);
      const { remotoEditado } = await prepararConflicto(repo, s);

      await repo.resolveConflict('remote');

      expect(valorActual(repo)).toEqual(remotoEditado);
      const conflictos: unknown[] = [];
      repo.conflict$.subscribe((c) => conflictos.push(c));
      expect(conflictos.at(-1)).toBeNull();
    });

    it("'local' reescribe con la versión del conflicto", async () => {
      const s = fakeSupabase({
        fila: fila(tableroRemoto(), VERSION_ANTERIOR),
        filaActualizada: null
      });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);
      const { local } = await prepararConflicto(repo, s);
      // Al resolver, el guardado sí casa.
      s.opciones.filaActualizada = { updated_at: VERSION_POSTERIOR };

      await repo.resolveConflict('local');

      // Se escribe la versión local, con el filtro de la versión que tuvo el conflicto.
      const datos = s.actualizado!['board_data'] as ChecklistBoard;
      expect(datos.lists[0].tasks[0].text).toBe('Leche desnatada');
      expect(s.llamadas).toContain(`eq:updated_at:${VERSION_POSTERIOR}`);
    });

    it("si el guardado local falla, el conflicto se republica", async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto(), VERSION_ANTERIOR), filaActualizada: null });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);
      await prepararConflicto(repo, s);
      // El guardado sigue sin casar.
      s.opciones.filaActualizada = null;

      await expect(repo.resolveConflict('local')).rejects.toThrow(BoardMergeConflictError);
      const conflictos: { reason: string }[] = [];
      repo.conflict$.subscribe((c) => conflictos.push(c as never));
      expect(conflictos.at(-1)!.reason).toMatch(/cambió otra vez/i);
    });
  });

  describe('startSynchronization y stopSynchronization', () => {
    it('al arrancar abre el canal y escucha foco y visibilidad', async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto(), VERSION_ANTERIOR) });
      const { repo } = montar(s);

      await repo.initializeForUser(USUARIO);

      expect(s.llamadas).toContain(`channel:board-sync:${USUARIO}`);
      // supabase-js usa 'postgres_changes' como tipo de evento; lo que distingue un
      // cambio de otro es el filtro (UPDATE/INSERT sobre la tabla boards).
      expect(s.llamadas.filter((l) => l === 'on:postgres_changes').length).toBe(2);
      expect(document.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
      expect(window.addEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
    });

    it('cambiar de usuario cierra la suscripción anterior', async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto(), VERSION_ANTERIOR) });
      const { repo } = montar(s);
      await repo.initializeForUser('user-1');

      await repo.initializeForUser('user-2');

      // Se cierra el canal del primero y se abre el del segundo.
      expect(s.llamadas).toContain('removeChannel');
      expect(s.llamadas).toContain('channel:board-sync:user-2');
      // Y los listeners viejos se quitan: si no, se acumularían en cada cambio de cuenta.
      expect(document.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
      expect(window.removeEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
    });

    it('al destruir el repositorio se cierra todo', async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto(), VERSION_ANTERIOR) });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);

      repo.ngOnDestroy();

      expect(s.llamadas).toContain('removeChannel');
      expect(document.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
      expect(window.removeEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
    });
  });
});
