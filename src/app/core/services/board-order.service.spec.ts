import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { Session } from '@supabase/supabase-js';
import { BoardOrderService } from './board-order.service';
import { AuthService } from './auth.service';
import { fakeSession } from './testing/fake-supabase';
import type { OrderableList, Rng } from '../session-order';

/**
 * Pruebas del orden aleatorio de las listas durante una sesión.
 *
 * La aleatoriedad se inyecta como parámetro de `sync`, así que los casos son deterministas:
 * con `rng = () => 0`, Fisher-Yates convierte ['a','b','c'] en ['b','c','a'].
 */

/** Listas de prueba: solo hacen falta los ids. */
const listas = (...ids: string[]): OrderableList[] => ids.map((id) => ({ id }));

/** rng que devuelve siempre 0: barajado fijo y predecible. */
const rngCero = (): Rng => () => 0;

/** rng que devuelve casi 1: Fisher-Yates no mueve nada, el orden se queda como estaba. */
const rngIdentidad = (): Rng => () => 0.999999;

/** rng que cuenta cuántas veces se le pide un número, junto al contador. */
const rngContador = (valor: number = 0) => {
  const contador = { llamadas: 0 };
  const rng: Rng = () => {
    contador.llamadas++;
    return valor;
  };
  return { rng, contador };
};

/** Monta el servicio con una sesión inicial controlable. */
const montar = (userIdInicial: string | null) => {
  const sessionChanges = new Subject<Session | null>();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      BoardOrderService,
      {
        provide: AuthService,
        useValue: {
          enabled: true,
          session: userIdInicial === null ? null : fakeSession(userIdInicial),
          sessionChanges: sessionChanges.asObservable()
        } as unknown as AuthService
      }
    ]
  });
  return { servicio: TestBed.inject(BoardOrderService), sessionChanges };
};

/** Emite un cambio de sesión: mismo usuario (refresco de token) u otro. */
const cambiarSesion = (
  sessionChanges: Subject<Session | null>,
  userId: string | null
): void => sessionChanges.next(userId === null ? null : fakeSession(userId));

describe('BoardOrderService', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  describe('primer barajado', () => {
    it('el primer tablero con listas baraja una sola vez y devuelve true', () => {
      const { servicio } = montar(null);
      const { rng, contador } = rngContador(0);

      const cambio = servicio.sync(listas('a', 'b', 'c'), null, rng);

      expect(cambio).toBe(true);
      // n-1 = 2 intercambios para 3 listas: prueba de que se barajó.
      expect(contador.llamadas).toBe(2);
      // ['a','b','c'] con rng()=0 acaba en ['b','c','a'] (Fisher-Yates).
      expect(servicio.sessionOrder).toEqual(['b', 'c', 'a']);
    });

    it('la lista pinneada queda primera al barajar', () => {
      const { servicio } = montar(null);

      servicio.sync(listas('a', 'b', 'c'), 'b', rngCero());

      expect(servicio.sessionOrder).toEqual(['b', 'c', 'a']);
    });

    it('un tablero vacío no baraja ni gasta la mezcla', () => {
      const { servicio } = montar(null);
      const { rng, contador } = rngContador(0);

      const cambio = servicio.sync([], null, rng);

      expect(cambio).toBe(false);
      expect(contador.llamadas).toBe(0); // no se pidió ningún número
      expect(servicio.sessionOrder).toEqual([]);

      // La primera vez que llegan listas sí se baraja, y con la mezcla intacta.
      servicio.sync(listas('a', 'b', 'c'), null, rng);
      expect(contador.llamadas).toBe(2);
      expect(servicio.sessionOrder).toEqual(['b', 'c', 'a']);
    });
  });

  describe('sincronizaciones siguientes', () => {
    it('una lista nueva va al final y no se vuelve a barajar', () => {
      const { servicio } = montar(null);
      servicio.sync(listas('a', 'b', 'c'), null, rngCero());
      const { rng, contador } = rngContador(0);

      const cambio = servicio.sync(listas('a', 'b', 'c', 'd'), null, rng);

      expect(contador.llamadas).toBe(0); // solo reconcilia: no se pide ningún número
      expect(servicio.sessionOrder).toEqual(['b', 'c', 'a', 'd']);
      // Ojo: devuelve FALSE, aunque la lista sea nueva. El orden de dibujo ya la colocaba
      // al final por la red de seguridad, así que visualmente no cambia nada. Quien repinte
      // confía en este valor, no en "hay una lista nueva".
      expect(cambio).toBe(false);
    });

    it('una lista eliminada sale del orden', () => {
      const { servicio } = montar(null);
      servicio.sync(listas('a', 'b', 'c'), null, rngCero());

      servicio.sync(listas('a', 'c'), null, rngCero());

      expect(servicio.sessionOrder).toEqual(['c', 'a']);
    });

    it('el orden es estable: sincronizar lo mismo no lo cambia', () => {
      const { servicio } = montar(null);
      servicio.sync(listas('a', 'b', 'c'), null, rngCero());
      const ordenAntes = servicio.sessionOrder;

      const cambio = servicio.sync(listas('a', 'b', 'c'), null, rngCero());

      expect(cambio).toBe(false);
      expect(servicio.sessionOrder).toEqual(ordenAntes);
    });

    it('devuelve false si el barajado da el mismo orden que ya se veía', () => {
      const { servicio } = montar(null);

      // Con rngIdentidad el barajado no mueve nada: el orden de dibujo no cambia.
      const cambio = servicio.sync(listas('a', 'b'), null, rngIdentidad());

      expect(cambio).toBe(false);
      expect(servicio.sessionOrder).toEqual(['a', 'b']);
    });
  });

  describe('cambio de pin', () => {
    it('la nueva sube primera y la anterior vuelve a su sitio', () => {
      const { servicio } = montar(null);
      servicio.sync(listas('a', 'b', 'c'), null, rngCero());
      servicio.sync(listas('a', 'b', 'c', 'd'), null, rngCero());
      // Orden de sesión: ['b','c','a','d'].

      const ordenNuevo = servicio.displayOrder(listas('a', 'b', 'c', 'd'), 'c');

      expect(ordenNuevo).toEqual(['c', 'b', 'a', 'd']);
      // El estado interno no cambia al consultar.
      expect(servicio.sessionOrder).toEqual(['b', 'c', 'a', 'd']);
    });
  });

  describe('displayOrder', () => {
    it('no muta el estado ni la entrada', () => {
      const { servicio } = montar(null);
      servicio.sync(listas('a', 'b', 'c'), null, rngCero());
      const entrada = listas('a', 'b', 'c');
      const copia = structuredClone(entrada);
      const ordenAntes = servicio.sessionOrder;

      const orden = servicio.displayOrder(entrada, 'b');

      expect(entrada).toEqual(copia); // la entrada queda intacta
      expect(servicio.sessionOrder).toEqual(ordenAntes); // el estado también
      expect(orden[0]).toBe('b');
    });

    it('la copia de sessionOrder no permite tocar el estado interno', () => {
      const { servicio } = montar(null);
      servicio.sync(listas('a', 'b', 'c'), null, rngCero());

      const copia = servicio.sessionOrder;
      copia.push('inventada');
      copia[0] = 'otra';

      expect(servicio.sessionOrder).toEqual(['b', 'c', 'a']);
    });

    it('cada lista aparece una vez, con el pin repetido o ausente', () => {
      const { servicio } = montar(null);
      servicio.sync(listas('a', 'b', 'c'), null, rngCero());

      for (const pin of [null, undefined, 'a', 'c', 'no-existe']) {
        const orden = servicio.displayOrder(listas('a', 'b', 'c'), pin);
        expect([...orden].sort()).toEqual(['a', 'b', 'c']);
      }
    });
  });

  describe('reset por cambio de sesión', () => {
    it('al cambiar de usuario se resetea y se vuelve a barajar', () => {
      const { servicio, sessionChanges } = montar(null);
      servicio.sync(listas('a', 'b', 'c'), null, rngCero());

      cambiarSesion(sessionChanges, 'user-1');

      expect(servicio.sessionOrder).toEqual([]);
      // El siguiente tablero baraja de nuevo, desde cero.
      servicio.sync(listas('a', 'b', 'c'), null, rngCero());
      expect(servicio.sessionOrder).toEqual(['b', 'c', 'a']);
    });

    it('al cerrar sesión también se resetea', () => {
      const { servicio, sessionChanges } = montar('user-1');
      servicio.sync(listas('a', 'b', 'c'), null, rngCero());

      cambiarSesion(sessionChanges, null);

      expect(servicio.sessionOrder).toEqual([]);
    });

    it('un refresco de token del mismo usuario NO resetea el orden', () => {
      const { servicio, sessionChanges } = montar('user-1');
      servicio.sync(listas('a', 'b', 'c'), null, rngCero());
      const ordenAntes = servicio.sessionOrder;

      // Supabase renueva el token de vez en cuando: mismo usuario, no debe reordenar.
      cambiarSesion(sessionChanges, 'user-1');

      expect(servicio.sessionOrder).toEqual(ordenAntes);
    });
  });
});
