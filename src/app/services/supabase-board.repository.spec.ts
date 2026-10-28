import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { moveListBefore, moveListByOffset } from '../core/board/board-list-rules/board-list-rules';
import { setSessionBlockedFlag } from '../core/auth/session-guard/session-guard';
import { SupabaseBoardRepository } from './supabase-board.repository';
import { AuthService } from './auth.service';
import { fakeSession, fakeSupabase, type FakeSupabase } from './testing/fake-supabase';
import type { ChecklistBoard } from '../models/board.model';

/**
 * Pruebas del repositorio sincronizado (Supabase).
 *
 * Se usa un cliente de Supabase falso (ver `testing/fake-supabase.ts`), así que no hay red
 * ni credenciales: solo se comprueba la lógica de versiones, el guardado serializado y la
 * regla last-write-wins (la anterior resolución manual de conflictos se eliminó por completo).
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
      expect(s.llamadas).toContain('realtime.setAuth:token-de-prueba');
      expect(busquedas(s)).toBe(1);
      expect(s.suscrito).toBe(true);
    });

    it('sin fila inserta usando la semilla local con id y fecha nuevos', async () => {
      const s = fakeSupabase({ fila: null, filaInsertada: fila(tableroRemoto(), AHORA_ISO) });
      const { repo } = montar(s);

      const semilla = { title: '', createdAt: '', lists: [] } as unknown as ChecklistBoard;
      await repo.initializeForUser(USUARIO, semilla);

      expect(s.insertado).not.toBeNull();
      expect(s.insertado!['owner_id']).toBe(USUARIO);
      expect(s.insertado!['title']).toBe('Mi tablero');
      expect(s.insertado!['created_at']).toBe(AHORA_ISO);
      const boardData = s.insertado!['board_data'] as ChecklistBoard;
      expect(boardData.id).not.toBe('');
      expect(boardData.createdAt).toBe(AHORA_ISO);
      expect(valorActual(repo).id).toBe('board-remoto');
    });

    it('un 23505 (otra pestaña creó la fila antes) relee y publica la existente', async () => {
      const existente = fila(tableroRemoto(), AHORA_ISO);
      const s = fakeSupabase({
        fila: (numero) => (numero === 0 ? null : existente),
        errorInsert: { code: '23505', message: 'duplicate' }
      });
      const { repo } = montar(s);

      await repo.initializeForUser(USUARIO, tableroRemoto());

      expect(valorActual(repo)).toEqual(tableroRemoto());
      expect(busquedas(s)).toBe(2);
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

  describe('saveBoard: guardado serializado', () => {
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
      expect(s.llamadas).toContain(`eq:updated_at:${VERSION_ANTERIOR}`);
      expect(s.actualizado!['updated_at']).toBe(AHORA_ISO);
      expect(historial.at(-1)!.lists[0].title).toBe('Compra semanal');
      expect(s.llamadas.filter((l) => l === 'boards.update').length).toBe(1);
    });

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
      moveListBefore(local, 'lista-2', 'lista-1');
      await repo.saveBoard(local);

      expect(s.llamadas.filter((l) => l === 'boards.update').length).toBe(1);
      const datos = s.actualizado!['board_data'] as ChecklistBoard;
      expect(datos.lists.map((l) => l.id)).toEqual(['lista-2', 'lista-1']);
      expect(datos.lists.map((l) => l.position)).toEqual([0, 1]);
    });

    it('varios guardados rápidos se funden en uno solo con el último estado', async () => {
      const remoto = tableroRemoto();
      const s = fakeSupabase({
        fila: fila(remoto, VERSION_ANTERIOR),
        filaActualizada: { updated_at: AHORA_ISO }
      });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);

      const a = structuredClone(remoto);
      a.lists[0].title = 'A';
      const b = structuredClone(remoto);
      b.lists[0].title = 'B';
      const c = structuredClone(remoto);
      c.lists[0].title = 'C';

      // Se lanzan los tres sin esperar: el primero parte, el segundo se encola y el tercero
      // lo reemplaza. Solo se guardan el primero y el último (el segundo se descarta).
      const p1 = repo.saveBoard(a);
      const p2 = repo.saveBoard(b);
      const p3 = repo.saveBoard(c);
      await Promise.all([p1, p2, p3]);

      const updates = s.llamadas.filter((l) => l === 'boards.update');
      expect(updates.length).toBe(2);
      const ultimo = s.actualizado!['board_data'] as ChecklistBoard;
      expect(ultimo.lists[0].title).toBe('C');
      expect(valorActual(repo).lists[0].title).toBe('C');
    });

    it('un guardado fallido no bloquea los siguientes ni pierde cambios', async () => {
      const remoto = tableroRemoto();
      // El primer update no casa, ni el reintento: la versión remota no avanzó.
      const s = fakeSupabase({
        fila: fila(remoto, VERSION_ANTERIOR),
        filaActualizada: null
      });
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

      await expect(repo.saveBoard(local)).rejects.toThrow(/No se pudo guardar/);

      // El segundo guardado sí casa: el fallo previo no bloqueó la cola.
      s.opciones.filaActualizada = { updated_at: AHORA_ISO };
      await repo.saveBoard(local);
      expect(s.llamadas.filter((l) => l === 'boards.update').length).toBe(3);
      const datos = s.actualizado!['board_data'] as ChecklistBoard;
      expect(datos.lists[0].tasks.map((t) => t.text)).toEqual(['Leche', 'Pan']);
    });

    it('sin tablero sincronizado previo, el error lo dice claro', async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto()) });
      const { repo } = montar(s);

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

  describe('saveBoard: last-write-wins', () => {
    it('remoto más reciente: se adopta en silencio y se descarta el local', async () => {
      const remoto = tableroRemoto();
      const s = fakeSupabase({
        fila: fila(remoto, VERSION_ANTERIOR),
        filaActualizada: null
      });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);

      const local = structuredClone(remoto);
      local.lists[0].title = 'Cambio local';
      const remotoMasNuevo = structuredClone(remoto);
      remotoMasNuevo.lists[0].title = 'Cambio remoto';
      s.opciones.fila = fila(remotoMasNuevo, VERSION_POSTERIOR);

      await repo.saveBoard(local);

      // Un solo intento de update (falló el optimista), no hay reescritura local.
      expect(s.llamadas.filter((l) => l === 'boards.update').length).toBe(1);
      expect(valorActual(repo).lists[0].title).toBe('Cambio remoto');
    });

    it('local igual o más reciente: se conserva el local y se guarda', async () => {
      const remoto = tableroRemoto();
      // El update optimista no casa; el reintento sobre la versión remota sí.
      const s = fakeSupabase({
        fila: fila(remoto, VERSION_ANTERIOR),
        filaActualizada: (numero) => (numero === 0 ? null : { updated_at: VERSION_POSTERIOR })
      });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);

      const local = structuredClone(remoto);
      local.lists[0].title = 'Cambio local';
      await repo.saveBoard(local);

      expect(s.llamadas).toContain(`eq:updated_at:${VERSION_ANTERIOR}`);
      expect(s.llamadas).toContain(`eq:updated_at:${VERSION_ANTERIOR}`);
      const datos = s.actualizado!['board_data'] as ChecklistBoard;
      expect(datos.lists[0].title).toBe('Cambio local');
      expect(valorActual(repo).lists[0].title).toBe('Cambio local');
    });

    it('marcas iguales: gana el local (empate en el reloj del servidor)', async () => {
      const remoto = tableroRemoto();
      const s = fakeSupabase({
        fila: fila(remoto, VERSION_ANTERIOR),
        filaActualizada: null
      });
      const { repo } = montar(s);
      await repo.initializeForUser(USUARIO);

      const local = structuredClone(remoto);
      local.lists[0].title = 'Cambio local';
      // La remota tiene la misma versión que la conocida: empate, gana el local.
      s.opciones.fila = fila(remoto, VERSION_ANTERIOR);
      s.opciones.filaActualizada = { updated_at: AHORA_ISO };

      await repo.saveBoard(local);

      const datos = s.actualizado!['board_data'] as ChecklistBoard;
      expect(datos.lists[0].title).toBe('Cambio local');
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

      await repo.saveBoard(remoto);
      await Promise.resolve();
      await Promise.resolve();

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

      s.emitirCambio({ id: 'board-remoto', updated_at: new Date(AHORA.getTime() + 120_000).toISOString() });
      await Promise.resolve();
      await Promise.resolve();
      expect(busquedas(s)).toBe(busquedasAntes);

      vi.setSystemTime(new Date(AHORA.getTime() + 4000));
      s.emitirCambio({ id: 'board-remoto', updated_at: new Date(AHORA.getTime() + 180_000).toISOString() });
      await Promise.resolve();
      await Promise.resolve();
      expect(busquedas(s)).toBe(busquedasAntes + 1);
    });

    it('tras un cambio de sesión se olvida del tablero y no refresca nada', async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto(), VERSION_ANTERIOR) });
      const { repo, sessionChanges } = montar(s);
      await repo.initializeForUser(USUARIO);
      const busquedasAntes = busquedas(s);

      sessionChanges.next(null as unknown as ReturnType<typeof fakeSession>);
      await repo.refresh();

      expect(busquedas(s)).toBe(busquedasAntes);
    });
  });

  describe('startSynchronization y stopSynchronization', () => {
    it('al arrancar abre el canal y escucha foco y visibilidad', async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto(), VERSION_ANTERIOR) });
      const { repo } = montar(s);

      await repo.initializeForUser(USUARIO);

      expect(s.llamadas).toContain(`channel:board-sync:${USUARIO}`);
      expect(s.llamadas.filter((l) => l === 'on:postgres_changes').length).toBe(2);
      expect(document.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
      expect(window.addEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
    });

    it('cambiar de usuario cierra la suscripción anterior', async () => {
      const s = fakeSupabase({ fila: fila(tableroRemoto(), VERSION_ANTERIOR) });
      const { repo } = montar(s);
      await repo.initializeForUser('user-1');

      await repo.initializeForUser('user-2');

      expect(s.llamadas).toContain('removeChannel');
      expect(s.llamadas).toContain('channel:board-sync:user-2');
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
