import { describe, expect, it, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../../services/auth.service';

/**
 * Pruebas de la guarda de rutas. Migrado como caso nuevo: antes no tenía cobertura.
 *
 * `authGuard` es una función que usa `inject()`, así que se ejecuta dentro de un
 * contexto de inyección con `TestBed.runInInjectionContext`. Lo único que se mockea
 * son AuthService y Router: nada de red ni de navegación real.
 */

/** Sesión mínima de supabase-js: solo hace falta el id del usuario. */
const session = (userId: string | null) => (userId ? { user: { id: userId } } : null);

/** AuthService falso: `enabled` decide si hay Supabase configurado. */
const authServiceFalso = (opciones: { enabled: boolean; userId: string | null }) => ({
  enabled: opciones.enabled,
  session: session(opciones.userId),
  getSession: async () => session(opciones.userId)
});

/** Router falso: en vez de crear un UrlTree real, devuelve un objeto reconocible. */
const routerFalso = () => ({
  createUrlTree: (segmentos: unknown[]) => ({ __urlTree: segmentos })
});

/** Ejecuta la guarda y normaliza el resultado: true (pasa) o el destino (no pasa). */
const evaluar = async (): Promise<true | { __urlTree: unknown[] }> => {
  // `route` y `state` no los usa la guarda, pero el tipo los exige: se pasan vacíos.
  const rutaVacia = {} as Parameters<typeof authGuard>[0];
  const estadoVacio = {} as Parameters<typeof authGuard>[1];
  const resultado = await TestBed.runInInjectionContext(() => authGuard(rutaVacia, estadoVacio));
  return resultado as true | { __urlTree: unknown[] };
};

describe('authGuard', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('con la sincronización desactivada (sin credenciales) deja pasar', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceFalso({ enabled: false, userId: null }) },
        { provide: Router, useValue: routerFalso() }
      ]
    });
    expect(await evaluar()).toBe(true);
  });

  it('con sesión iniciada deja pasar', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceFalso({ enabled: true, userId: 'user-a' }) },
        { provide: Router, useValue: routerFalso() }
      ]
    });
    expect(await evaluar()).toBe(true);
  });

  it('sin sesión manda a /login', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceFalso({ enabled: true, userId: null }) },
        { provide: Router, useValue: routerFalso() }
      ]
    });
    const destino = await evaluar();
    expect(destino).toEqual({ __urlTree: ['/login'] });
  });
});
