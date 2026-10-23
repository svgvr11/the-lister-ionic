import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { Subject } from 'rxjs';
import { SessionGuardService } from './session-guard.service';
import { AuthService } from './auth.service';
import { fakeSession } from './testing/fake-supabase';
import {
  consumeLocalAuthChange,
  isSessionBlocked,
  markLocalAuthChange,
  setSessionBlockedFlag
} from '../core/session-guard';
import type { Session } from '@supabase/supabase-js';

/**
 * Pruebas del guardia de sesión entre pestañas.
 *
 * El bloqueo se decide a partir de dos señales: los cambios que emite `AuthService`
 * (supabase-js los propaga entre pestañas por BroadcastChannel) y el evento `storage` de
 * `window`, que aquí se dispara a mano con un `StorageEvent`.
 */

/** Valor guardado en localStorage para la clave de sesión de Supabase. */
const CLAVE_SESION = 'sb-abcdefghij-auth-token';

/** Sesión mínima de supabase-js. */
const sesionDe = (userId: string): Session => fakeSession(userId) as Session;

/** Monta el guardia con una sesión inicial controlable. */
const montar = (userIdInicial: string | null) => {
  const sessionChanges = new Subject<Session | null>();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      SessionGuardService,
      {
        provide: AuthService,
        useValue: {
          enabled: true,
          session: userIdInicial === null ? null : sesionDe(userIdInicial),
          sessionChanges: sessionChanges.asObservable()
        } as unknown as AuthService
      }
    ]
  });
  return { guardia: TestBed.inject(SessionGuardService), sessionChanges };
};

/** Simula que OTRA pestaña escribe la clave de sesión de Supabase. */
const escribirSesionCompartida = (valor: string | null): void => {
  window.dispatchEvent(
    new StorageEvent('storage', { key: CLAVE_SESION, newValue: valor })
  );
};

/** Estado guardado para un usuario, tal como lo escribe supabase-js. */
const sesionGuardada = (userId: string): string =>
  JSON.stringify({ user: { id: userId }, access_token: 'token' });

/** Pone el entorno en modo nativo y devuelve cómo restaurarlo. */
const ponerNativo = (): (() => void) => {
  const capacitor = Capacitor as unknown as Record<string, unknown>;
  const original = capacitor['isNativePlatform'];
  capacitor['isNativePlatform'] = () => true;
  return () => {
    capacitor['isNativePlatform'] = original;
  };
};

describe('SessionGuardService', () => {
  let restaurarNativo: (() => void) | null = null;
  /** Listeners de 'storage' que se van añadiendo, para limpiarlos al terminar. */
  let listenersStorage: EventListener[] = [];

  beforeEach(() => {
    restaurarNativo = null;
    listenersStorage = [];
    TestBed.resetTestingModule();
    // Los listeners de `window` viven fuera del TestBed: si no se limpian, un guardia de
    // un caso anterior seguiría escuchando y bloquearía el flag global del módulo.
    const agregarOriginal = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((tipo, cb, opciones) => {
      if (tipo === 'storage') listenersStorage.push(cb as EventListener);
      return agregarOriginal(tipo, cb, opciones);
    });
    // Los flags de módulo son globales: se limpian para no contaminar otros casos.
    setSessionBlockedFlag(null);
    consumeLocalAuthChange();
  });

  afterEach(() => {
    for (const listener of listenersStorage) window.removeEventListener('storage', listener);
    listenersStorage = [];
    restaurarNativo?.();
    restaurarNativo = null;
    setSessionBlockedFlag(null);
    consumeLocalAuthChange();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  describe('arm', () => {
    it('en web con sesión se arma y recuerda el usuario', () => {
      const { guardia } = montar('user-1');
      expect(guardia.active).toBe(true);

      guardia.arm();

      expect(guardia.isBlocked()).toBe(false);
    });

    it('sin sesión no se arma', () => {
      const { guardia } = montar(null);

      guardia.arm();

      // Sin usuario inicial no hay nada que comparar: un cambio no puede ser "de otro".
      expect(guardia.isBlocked()).toBe(false);
    });

    it('en nativo queda desactivado', () => {
      restaurarNativo = ponerNativo();
      const { guardia, sessionChanges } = montar('user-1');

      guardia.arm();
      sessionChanges.next(null);

      // En el APK no hay varias pestañas: nada que bloquear.
      expect(guardia.active).toBe(false);
      expect(guardia.isBlocked()).toBe(false);
    });

    it('arm es idempotente: no duplica la vigilancia', () => {
      const { guardia, sessionChanges } = montar('user-1');

      guardia.arm();
      guardia.arm();
      guardia.arm();

      sessionChanges.next(null);
      expect(guardia.isBlocked()).toBe(true);
    });
  });

  describe('bloqueo por cambio de otra pestaña', () => {
    it('otra pestaña cierra sesión y esta se bloquea', () => {
      const { guardia, sessionChanges } = montar('user-1');
      guardia.arm();

      sessionChanges.next(null);

      expect(guardia.blocked()).toBe('signed-out');
      expect(guardia.isBlocked()).toBe(true);
      // El flag de módulo queda sincronizado: los repositorios dejan de escribir.
      expect(isSessionBlocked()).toBe(true);
    });

    it('otra pestaña entra con otra cuenta y esta se bloquea', () => {
      const { guardia, sessionChanges } = montar('user-1');
      guardia.arm();

      sessionChanges.next(sesionDe('user-2'));

      expect(guardia.blocked()).toBe('other-account');
    });

    it('lo mismo se detecta por el evento storage con la clave de Supabase', () => {
      const { guardia } = montar('user-1');
      guardia.arm();

      escribirSesionCompartida(null);

      expect(guardia.blocked()).toBe('signed-out');
    });

    it('por storage, otro userId en la sesión compartida bloquea', () => {
      const { guardia } = montar('user-1');
      guardia.arm();

      escribirSesionCompartida(sesionGuardada('user-2'));

      expect(guardia.blocked()).toBe('other-account');
    });

    it('un refresco de token del mismo usuario no bloquea', () => {
      const { guardia, sessionChanges } = montar('user-1');
      guardia.arm();

      // Supabase renueva el token cada pocos minutos: mismo usuario, no es un cambio.
      sessionChanges.next(sesionDe('user-1'));

      expect(guardia.isBlocked()).toBe(false);
    });

    it('el bloqueo es pegajoso: ningún evento posterior lo desbloquea', () => {
      const { guardia, sessionChanges } = montar('user-1');
      guardia.arm();

      sessionChanges.next(null); // se bloquea
      sessionChanges.next(sesionDe('user-2')); // intento de "arreglarlo"
      sessionChanges.next(sesionDe('user-1'));
      escribirSesionCompartida(sesionGuardada('user-1'));

      expect(guardia.blocked()).toBe('signed-out');
      expect(isSessionBlocked()).toBe(true);
    });
  });

  describe('cambio local propio', () => {
    it('un cierre de sesión propio no bloquea y adopta el nuevo usuario', () => {
      const { guardia, sessionChanges } = montar('user-1');
      guardia.arm();

      // Así marca AuthService su propio signOut: antes de tocar Supabase.
      markLocalAuthChange();
      sessionChanges.next(null);

      expect(guardia.isBlocked()).toBe(false);
      // El usuario inicial pasa a ser el nuevo: null.
      markLocalAuthChange();
      sessionChanges.next(sesionDe('user-3')); // cambio local a otra cuenta
      expect(guardia.isBlocked()).toBe(false);
    });

    it('la marca se consume una sola vez', () => {
      const { guardia, sessionChanges } = montar('user-1');
      guardia.arm();

      markLocalAuthChange();
      sessionChanges.next(sesionDe('user-2')); // se come la marca local
      expect(guardia.isBlocked()).toBe(false);

      // Sin marca, el siguiente cambio sí es de otra pestaña y bloquea.
      sessionChanges.next(sesionDe('user-3'));
      expect(guardia.blocked()).toBe('other-account');
    });

    it('una marca pendiente al armar se descarta', () => {
      // Si quedó una marca de una acción anterior, no debe comerse el primer cambio real.
      markLocalAuthChange();
      const { guardia, sessionChanges } = montar('user-1');

      guardia.arm();
      expect(consumeLocalAuthChange()).toBe(false); // ya se consumió al armar

      sessionChanges.next(sesionDe('user-2'));
      expect(guardia.isBlocked()).toBe(true);
    });
  });

  describe('datos corruptos o ajenos', () => {
    it('un JSON corrupto en la sesión compartida se trata como sesión cerrada', () => {
      const { guardia } = montar('user-1');
      guardia.arm();

      // Sin usuario legible no se puede distinguir de un cierre de sesión, así que se
      // bloquea del lado seguro: mejor un modal de más que escribir con otra cuenta.
      escribirSesionCompartida('{esto no es JSON');

      expect(guardia.blocked()).toBe('signed-out');
    });

    it('una clave de localStorage ajena se ignora', () => {
      const { guardia } = montar('user-1');
      guardia.arm();

      window.dispatchEvent(
        new StorageEvent('storage', { key: 'the-lister-ionic-v1', newValue: '{}' })
      );
      window.dispatchEvent(new StorageEvent('storage', { key: 'otra-clave', newValue: null }));

      expect(guardia.isBlocked()).toBe(false);
    });
  });

  describe('disarm y resetAfterNavigation', () => {
    it('disarm deja de vigilar y no bloquea', () => {
      const { guardia } = montar('user-1');
      guardia.arm();

      guardia.disarm();
      escribirSesionCompartida(null);

      expect(guardia.isBlocked()).toBe(false);
      expect(isSessionBlocked()).toBe(false);
    });

    it('resetAfterNavigation sale del bloqueo pero lo recuerda', () => {
      const { guardia, sessionChanges } = montar('user-1');
      guardia.arm();
      sessionChanges.next(null);
      expect(guardia.blocked()).toBe('signed-out');

      guardia.resetAfterNavigation();

      expect(guardia.blocked()).toBeNull();
      expect(isSessionBlocked()).toBe(false);
    });

    it('al rearmar se retira el listener anterior en vez de acumularlo', () => {
      const { guardia } = montar('user-1');
      const quitados: EventListener[] = [];
      const quitarOriginal = window.removeEventListener.bind(window);
      vi.spyOn(window, 'removeEventListener').mockImplementation((tipo, cb, opciones) => {
        if (tipo === 'storage') quitados.push(cb as EventListener);
        return quitarOriginal(tipo, cb, opciones);
      });

      guardia.arm();
      const primerListener = listenersStorage.at(-1)!;
      guardia.disarm();
      guardia.arm();

      expect(listenersStorage.length).toBe(2); // uno por arm
      // El que se retira es exactamente el que se había añadido: no se acumulan.
      expect(quitados).toContain(primerListener);
    });
  });
});
