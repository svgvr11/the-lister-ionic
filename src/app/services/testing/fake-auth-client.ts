import { vi } from 'vitest';

/**
 * Cliente de Supabase falso centrado en autenticación.
 *
 * `AuthService` crea su cliente en el constructor a partir del `environment`, y no se
 * pueden inyectar dobles por DI. La forma de probarlo sin red y sin credenciales reales
 * es mockear `@supabase/supabase-js` para que `createClient` devuelva esto: el servicio
 * usa exactamente el mismo código de producción.
 */

/** Respuestas que cada prueba puede ajustar. */
export interface FakeAuthEstado {
  /** Respuesta de `auth.getSession`. */
  sesion: { data: { session: unknown }; error: unknown };
  /** Respuesta de `auth.signInWithOAuth`. */
  oauth: { data: { url?: string }; error: unknown };
  /** Respuesta de `auth.exchangeCodeForSession`. */
  canje: { error: unknown };
  /** Respuesta de `auth.signOut`. */
  cierre: { error: unknown };
  /** Respuesta de `auth.refreshSession`. */
  refresco: { data: { session: unknown }; error: unknown };
  /** Respuesta de `functions.invoke`. */
  funcion: { data: unknown; error: unknown };
}

/** Cliente falso, con el estado ajustable y los espías a la vista. */
export interface FakeAuthClient {
  cliente: unknown;
  estado: FakeAuthEstado;
  auth: {
    getSession: ReturnType<typeof vi.fn>;
    onAuthStateChange: ReturnType<typeof vi.fn>;
    signInWithOAuth: ReturnType<typeof vi.fn>;
    exchangeCodeForSession: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
    refreshSession: ReturnType<typeof vi.fn>;
  };
  functions: { invoke: ReturnType<typeof vi.fn> };
  /** Callback registrado por `onAuthStateChange`, para emitir sesiones desde el test. */
  emitirSesion: (evento: string, sesion: unknown) => void;
}

/** Crea el cliente falso con respuestas por defecto que no fallan. */
export function fakeAuthClient(): FakeAuthClient {
  const estado: FakeAuthEstado = {
    sesion: { data: { session: null }, error: null },
    oauth: { data: { url: 'https://cuentas.example.com/o/oauth?code=abc' }, error: null },
    canje: { error: null },
    cierre: { error: null },
    refresco: { data: { session: null }, error: null },
    funcion: { data: { ok: true }, error: null }
  };

  let cambioSesion: ((evento: string, sesion: unknown) => void) | undefined;

  const auth = {
    getSession: vi.fn(async () => estado.sesion),
    // El constructor de AuthService se suscribe aquí: se guarda el callback para poder
    // simular que la sesión cambia (login, refresh de token, logout).
    onAuthStateChange: vi.fn((cb: (evento: string, sesion: unknown) => void) => {
      cambioSesion = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithOAuth: vi.fn(async () => estado.oauth),
    exchangeCodeForSession: vi.fn(async () => estado.canje),
    signOut: vi.fn(async () => estado.cierre),
    refreshSession: vi.fn(async () => estado.refresco)
  };

  const functions = { invoke: vi.fn(async () => estado.funcion) };

  return {
    cliente: { auth, functions },
    estado,
    auth,
    functions,
    emitirSesion: (evento: string, sesion: unknown) => cambioSesion?.(evento, sesion)
  };
}
