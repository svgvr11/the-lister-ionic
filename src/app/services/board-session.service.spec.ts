import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { Session } from '@supabase/supabase-js';
import { BoardSessionService } from './board-session.service';
import { AuthService } from './auth.service';
import { LocalBoardRepository } from './local-board.repository';
import { SupabaseBoardRepository } from './supabase-board.repository';
import { fakeSession } from './testing/fake-supabase';
import type { ChecklistBoard } from '../../models/board.model';

/**
 * Pruebas del servicio que abre el tablero.
 *
 * Se usan tres dobles: la sesión (`AuthService`) y los dos repositorios. Así se comprueba
 * cuál se elige en cada caso sin tocar localStorage ni Supabase de verdad.
 */

const tablero = (id: string): ChecklistBoard => ({
  id,
  title: `Tablero ${id}`,
  createdAt: '2026-01-01T00:00:00.000Z',
  lists: []
});

/** Repositorio falso con todo lo que `BoardSessionService` necesita. */
const repoFalso = (nombre: string) => {
  const subject = new BehaviorSubject<ChecklistBoard>(tablero(nombre));
  const conflictos = new BehaviorSubject<unknown>(null);
  // `watchBoard()` devuelve SIEMPRE el mismo observable, para poder compararlo por identidad.
  const observable: Observable<ChecklistBoard> = subject.asObservable();
  const fake = {
    initializeForUser: vi.fn(async () => undefined),
    getStoredBoardForUser: vi.fn((): ChecklistBoard | null => null),
    watchBoard: () => observable,
    saveBoard: vi.fn(async () => undefined),
    refresh: vi.fn(async () => undefined),
    resolveConflict: vi.fn(async () => undefined),
    conflict$: conflictos.asObservable()
  };
  return { fake, observable, subject, conflictos };
};

/** Monta el servicio con una sesión y unos repositorios concretos. */
const montar = (
  userId: string | null,
  local: ReturnType<typeof repoFalso>,
  supabase: ReturnType<typeof repoFalso>
) => {
  const sessionChanges = new Subject<Session | null>();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      BoardSessionService,
      {
        provide: AuthService,
        useValue: {
          enabled: true,
          session: userId === null ? null : fakeSession(userId),
          sessionChanges: sessionChanges.asObservable()
        } as unknown as AuthService
      },
      { provide: LocalBoardRepository, useValue: local.fake as unknown as LocalBoardRepository },
      { provide: SupabaseBoardRepository, useValue: supabase.fake as unknown as SupabaseBoardRepository }
    ]
  });
  return TestBed.inject(BoardSessionService);
};

describe('BoardSessionService', () => {
  let local: ReturnType<typeof repoFalso>;
  let supabase: ReturnType<typeof repoFalso>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    local = repoFalso('local');
    supabase = repoFalso('supabase');
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  describe('open: elección de repositorio', () => {
    it('sin sesión usa el repositorio local', async () => {
      const servicio = montar(null, local, supabase);

      const tableroEnVivo = await servicio.open();

      expect(local.fake.initializeForUser).toHaveBeenCalledWith(null);
      expect(supabase.fake.initializeForUser).not.toHaveBeenCalled();
      // Devuelve el observable del local, no el de Supabase.
      expect(tableroEnVivo).toBe(local.observable);
    });

    it('con sesión usa el de Supabase y le pasa la semilla local', async () => {
      const semilla = tablero('semilla-local');
      (local.fake.getStoredBoardForUser as ReturnType<typeof vi.fn>).mockReturnValue(semilla);
      const servicio = montar('user-1', local, supabase);

      const tableroEnVivo = await servicio.open();

      expect(local.fake.initializeForUser).toHaveBeenCalledWith('user-1');
      expect(local.fake.getStoredBoardForUser).toHaveBeenCalledWith('user-1');
      expect(supabase.fake.initializeForUser).toHaveBeenCalledWith('user-1', semilla);
      expect(tableroEnVivo).toBe(supabase.observable);
    });

    it('con sesión pero sin tablero guardado, pasa semilla null', async () => {
      const servicio = montar('user-2', local, supabase);

      await servicio.open();

      expect(local.fake.getStoredBoardForUser).toHaveBeenCalledWith('user-2');
      expect(supabase.fake.initializeForUser).toHaveBeenCalledWith('user-2', null);
    });
  });

  describe('open: errores', () => {
    it('si el repositorio local falla, open() propaga el error', async () => {
      (local.fake.initializeForUser as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('localStorage lleno'));
      const servicio = montar(null, local, supabase);

      await expect(servicio.open()).rejects.toThrow(/localStorage lleno/);
    });

    it('si Supabase falla, open() propaga el error', async () => {
      (supabase.fake.initializeForUser as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('sin conexión'));
      const servicio = montar('user-1', local, supabase);

      await expect(servicio.open()).rejects.toThrow(/sin conexión/);
    });
  });

  describe('delegación en el repositorio activo', () => {
    it('sin sesión, guardar y refrescar van al local', async () => {
      const servicio = montar(null, local, supabase);
      await servicio.open();

      const board = tablero('a-guardar');
      await servicio.save(board);

      expect(local.fake.saveBoard).toHaveBeenCalledWith(board);
      expect(supabase.fake.saveBoard).not.toHaveBeenCalled();

      await servicio.refresh();
      expect(local.fake.refresh).toHaveBeenCalled();

      await servicio.resolveConflict('local');
      expect(local.fake.resolveConflict).toHaveBeenCalledWith('local');
    });

    it('con sesión, guardar y refrescar van a Supabase', async () => {
      const servicio = montar('user-1', local, supabase);
      await servicio.open();

      const board = tablero('a-guardar');
      await servicio.save(board);

      expect(supabase.fake.saveBoard).toHaveBeenCalledWith(board);
      expect(local.fake.saveBoard).not.toHaveBeenCalled();

      await servicio.refresh();
      expect(supabase.fake.refresh).toHaveBeenCalled();

      await servicio.resolveConflict('remote');
      expect(supabase.fake.resolveConflict).toHaveBeenCalledWith('remote');
    });

    it('los errores de guardado se propagan tal cual', async () => {
      (supabase.fake.saveBoard as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('versión desactualizada')
      );
      const servicio = montar('user-1', local, supabase);
      await servicio.open();

      await expect(servicio.save(tablero('x'))).rejects.toThrow(/versión desactualizada/);
    });
  });

  describe('estado expuesto', () => {
    it('userId sale de la sesión', () => {
      expect(montar('user-1', local, supabase).userId).toBe('user-1');
      expect(montar(null, local, supabase).userId).toBeNull();
    });

    it('conflict$ refleja el repositorio activo', async () => {
      const servicio = montar('user-1', local, supabase);
      await servicio.open();

      expect(servicio.conflict$).toBe(supabase.fake.conflict$);
    });
  });

  describe('cambio de sesión', () => {
    it('tras cerrar sesión se vuelve al repositorio local', async () => {
      // Abrir con sesión: el activo pasa a ser el de Supabase.
      const conSesion = montar('user-1', local, supabase);
      expect(await conSesion.open()).toBe(supabase.observable);

      // Mismo proceso, nueva apertura sin sesión: debe volver al local.
      const sinSesion = montar(null, local, supabase);
      const tableroEnVivo = await sinSesion.open();

      expect(tableroEnVivo).toBe(local.observable);
    });

    it('abrir otra vez con la misma sesión vuelve a usar Supabase', async () => {
      const servicio = montar('user-1', local, supabase);
      const primera = await servicio.open();
      const segunda = await servicio.open();

      expect(primera).toBe(segunda);
      // No hay memoria de la elección: cada apertura vuelve a decidir.
      expect(supabase.fake.initializeForUser).toHaveBeenCalledTimes(2);
    });
  });
});
