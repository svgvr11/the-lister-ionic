import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { AuthService, SUPABASE_CLIENT } from './auth.service';
import { consumeLocalAuthChange, setSessionBlockedFlag } from '../core/session-guard';
import { fakeAuthClient, type FakeAuthClient } from './testing/fake-auth-client';
import type { DeleteAccountResult } from '../core/delete-account';

/**
 * Pruebas de AuthService: sesión, OAuth (web y nativo), cierre y borrado de cuenta.
 *
 * El cliente de Supabase se inyecta por el token `SUPABASE_CLIENT`, así que aquí se pasa
 * uno falso y nunca se crea un cliente real con las credenciales de verdad.
 *
 * Limitación del entorno de pruebas, anotada: los plugins de Capacitor (`App`, `Browser`)
 * son proxies sin propiedades propias, así que `vi.spyOn` no puede sustituirlos y no se
 * puede comprobar que se abra o se cierre el navegador del sistema. Lo que sí se comprueba
 * es la decisión que lleva a hacerlo (las opciones de OAuth y la URL disponible), y el
 * retorno de OAuth se prueba llamando al método que invocaría el listener de `appUrlOpen`.
 */

/** Sesión de supabase-js mínima. */
const sesion = (userId: string) => ({ user: { id: userId }, access_token: 'token' });

/** Crea el servicio con un cliente falso ya colocado. */
const montar = (cliente: FakeAuthClient | null) => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      AuthService,
      // `null` simula que el entorno no tiene credenciales de Supabase.
      { provide: SUPABASE_CLIENT, useValue: cliente === null ? null : cliente.cliente }
    ]
  });
  return TestBed.inject(AuthService);
};

/** El retorno de OAuth es privado; se llama como lo haría el listener de `appUrlOpen`. */
const volverDeOAuth = (auth: AuthService, url: string): Promise<void> =>
  (auth as unknown as { handleAuthCallback: (url: string) => Promise<void> }).handleAuthCallback(url);

/** Deja que las promesas pendientes se resuelvan. */
const vaciarPromesas = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Sustituye `Capacitor.isNativePlatform` y devuelve cómo restaurarlo. */
const sustituirMetodo = (objeto: object, clave: string, falso: unknown): (() => void) => {
  const caja = objeto as unknown as Record<string, unknown>;
  const original = caja[clave];
  caja[clave] = falso;
  return () => {
    caja[clave] = original;
  };
};

const URL_NATIVA = 'dev.vmunoz.thelister://auth/callback?code=abc123';

describe('AuthService', () => {
  let cliente: FakeAuthClient;
  const restauradores: (() => void)[] = [];

  beforeEach(() => {
    // Primero se limpian los mocks anteriores y DESPUÉS se crea el cliente falso:
    // si se hiciera al revés, `restoreAllMocks` borraría sus implementaciones.
    vi.restoreAllMocks();
    cliente = fakeAuthClient();
    restauradores.push(sustituirMetodo(Capacitor, 'isNativePlatform', () => false));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Los flags de módulo son globales: se limpian para no contaminar otros casos.
    setSessionBlockedFlag(null);
    consumeLocalAuthChange();
  });

  afterEach(() => {
    while (restauradores.length > 0) restauradores.pop()!();
    setSessionBlockedFlag(null);
    consumeLocalAuthChange();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  describe('credenciales', () => {
    it('con cliente disponible se habilita la sincronización', () => {
      expect(montar(cliente).enabled).toBe(true);
    });

    it('sin cliente queda en modo local', () => {
      expect(montar(null).enabled).toBe(false);
    });

    it('sin cliente, usar Supabase lanza un error claro', async () => {
      const auth = montar(null);
      await expect(auth.signInWithGoogle()).rejects.toThrow(/Configura las credenciales/);
    });
  });

  describe('getSession', () => {
    it('devuelve la sesión guardada y la memoriza', async () => {
      cliente.estado.sesion = { data: { session: sesion('user-1') }, error: null };
      const auth = montar(cliente);

      expect(await auth.getSession()).toEqual(sesion('user-1'));
      expect(auth.session?.user.id).toBe('user-1');
    });

    it('sin cliente devuelve null en vez de lanzar', async () => {
      expect(await montar(null).getSession()).toBeNull();
    });

    it('un error de Supabase se propaga', async () => {
      cliente.estado.sesion = { data: { session: null }, error: { message: 'red caída' } };
      const auth = montar(cliente);

      await expect(auth.getSession()).rejects.toThrow(/red caída/);
    });
  });

  describe('sessionChanges', () => {
    it('emite cada cambio de sesión y actualiza la sesión activa', () => {
      const auth = montar(cliente);
      const vistas: (string | null)[] = [];
      auth.sessionChanges.subscribe((s) => vistas.push(s?.user.id ?? null));

      cliente.emitirSesion('SIGNED_IN', sesion('user-1'));
      cliente.emitirSesion('TOKEN_REFRESHED', sesion('user-1'));
      cliente.emitirSesion('SIGNED_OUT', null);

      expect(vistas).toEqual(['user-1', 'user-1', null]);
      expect(auth.session).toBeNull();
    });
  });

  describe('signInWithGoogle', () => {
    it('en web no salta al navegador y vuelve al origen', async () => {
      const auth = montar(cliente);

      await auth.signInWithGoogle();

      const argumento = cliente.auth.signInWithOAuth.mock.calls[0][0];
      expect(argumento.provider).toBe('google');
      expect(argumento.options.queryParams.prompt).toBe('select_account');
      // En web supabase-js redirige solo: `skipBrowserRedirect` en false es la señal de
      // que no hay que abrir ningún navegador a mano.
      expect(argumento.options.skipBrowserRedirect).toBe(false);
      expect(argumento.options.redirectTo).toBe(globalThis.location.origin);
    });

    it('en nativo deja el retorno en el esquema de la app y no redirige solo', async () => {
      restauradores.push(sustituirMetodo(Capacitor, 'isNativePlatform', () => true));
      const auth = montar(cliente);

      await auth.signInWithGoogle();

      const opciones = cliente.auth.signInWithOAuth.mock.calls[0][0].options;
      // `skipBrowserRedirect` en true es lo que hace que el salto al navegador del
      // sistema lo dé esta app con `Browser.open`, y no supabase-js por su cuenta.
      expect(opciones.skipBrowserRedirect).toBe(true);
      // El retorno usa el esquema propio de la app, para que Android la reabra.
      expect(opciones.redirectTo).toBe('dev.vmunoz.thelister://auth/callback');
      // La URL de Google existe, que es la condición para abrir el navegador.
      expect(cliente.estado.oauth.data.url).toBe('https://cuentas.example.com/o/oauth?code=abc');
    });

    it('marca el cambio local antes de tocar Supabase', async () => {
      const auth = montar(cliente);
      // Así el evento de sesión posterior se reconoce como propio y no bloquea la pestaña.
      await auth.signInWithGoogle();
      expect(consumeLocalAuthChange()).toBe(true);
    });

    it('marca el cambio local aunque el inicio de sesión falle', async () => {
      cliente.estado.oauth = { data: {}, error: { message: 'proveedor caído' } };
      const auth = montar(cliente);

      await expect(auth.signInWithGoogle()).rejects.toThrow(/proveedor caído/);
      // Se marcó antes de la llamada: el fallo no deja la marca olvidada.
      expect(consumeLocalAuthChange()).toBe(true);
    });

    it('en nativo sin URL de Google el inicio de sesión termina sin error', async () => {
      restauradores.push(sustituirMetodo(Capacitor, 'isNativePlatform', () => true));
      cliente.estado.oauth = { data: { url: '' }, error: null };
      const auth = montar(cliente);

      // Sin URL no hay navegador que abrir: el flujo acaba sin romperse.
      await expect(auth.signInWithGoogle()).resolves.toBeUndefined();
      expect(cliente.auth.signInWithOAuth).toHaveBeenCalled();
    });
  });

  describe('retorno de OAuth (vuelta del navegador nativo)', () => {
    it('con el prefijo nativo y un code, canjea la sesión', async () => {
      const auth = montar(cliente);

      await volverDeOAuth(auth, URL_NATIVA);

      expect(cliente.auth.exchangeCodeForSession).toHaveBeenCalledWith('abc123');
    });

    it('si Google devuelve un error, no canjea y lo registra', async () => {
      const auth = montar(cliente);

      await volverDeOAuth(auth, 'dev.vmunoz.thelister://auth/callback?error_description=acceso+denegado');

      expect(cliente.auth.exchangeCodeForSession).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith('Error de autenticación:', 'acceso denegado');
    });

    it('sin code no hace nada', async () => {
      const auth = montar(cliente);

      await volverDeOAuth(auth, 'dev.vmunoz.thelister://auth/callback');

      expect(cliente.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    });

    it('una URL de otra app se ignora', async () => {
      const auth = montar(cliente);

      await volverDeOAuth(auth, 'https://otra-app.example/callback?code=abc');

      expect(cliente.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    });

    it('si el canje falla, se registra y la app sigue', async () => {
      cliente.estado.canje = { error: { message: 'code caducado' } };
      const auth = montar(cliente);

      await volverDeOAuth(auth, URL_NATIVA);
      await vaciarPromesas();

      expect(console.error).toHaveBeenCalledWith('No se pudo crear la sesión:', 'code caducado');
      // No lanza: la app no se queda colgada al volver del navegador.
      expect(auth.session).toBeNull();
    });
  });

  describe('signOut', () => {
    it('marca el cambio local, cierra la sesión y la olvida', async () => {
      const auth = montar(cliente);
      cliente.emitirSesion('SIGNED_IN', sesion('user-1'));

      await auth.signOut();

      expect(cliente.auth.signOut).toHaveBeenCalledWith(undefined);
      expect(auth.session).toBeNull();
      expect(consumeLocalAuthChange()).toBe(true);
    });

    it('respeta el ámbito pedido', async () => {
      const auth = montar(cliente);

      await auth.signOut({ scope: 'local' });
      await auth.signOut({ scope: 'global' });
      await auth.signOut({ scope: 'others' });

      expect(cliente.auth.signOut.mock.calls.map((c) => c[0])).toEqual([
        { scope: 'local' },
        { scope: 'global' },
        { scope: 'others' }
      ]);
    });

    it('un error de Supabase se propaga', async () => {
      cliente.estado.cierre = { error: { message: 'no se pudo cerrar' } };
      const auth = montar(cliente);

      await expect(auth.signOut()).rejects.toThrow(/no se pudo cerrar/);
    });
  });

  describe('deleteAccount', () => {
    it('si la función responde ok, cierra sesión local y devuelve éxito', async () => {
      cliente.estado.funcion = { data: { ok: true }, error: null };
      const auth = montar(cliente);

      expect(await auth.deleteAccount()).toEqual({ ok: true });
      expect(cliente.functions.invoke).toHaveBeenCalledWith('delete-account', { body: {} });
      // Cierra solo la sesión de esta pestaña: las demás se enteran por realtime.
      expect(cliente.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(auth.session).toBeNull();
    });

    it('un 401 caduco se refresca y se reintenta una vez', async () => {
      const auth = montar(cliente);
      cliente.estado.refresco = { data: { session: sesion('user-1') }, error: null };
      cliente.functions.invoke = vi
        .fn()
        .mockResolvedValueOnce({ data: null, error: { status: 401, message: 'jwt expirado' } })
        .mockResolvedValueOnce({ data: { ok: true }, error: null });

      expect(await auth.deleteAccount()).toEqual({ ok: true });
      expect(cliente.auth.refreshSession).toHaveBeenCalledTimes(1);
      expect(cliente.functions.invoke).toHaveBeenCalledTimes(2);
      expect(cliente.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    });

    it('un 401 persistente cierra sesión local y nunca lo trata como éxito', async () => {
      const auth = montar(cliente);
      cliente.estado.refresco = { data: { session: sesion('user-1') }, error: null };
      cliente.functions.invoke = vi
        .fn()
        .mockResolvedValue({ data: null, error: { status: 401, message: 'jwt inválido' } });

      const resultado = (await auth.deleteAccount()) as Extract<DeleteAccountResult, { ok: false }>;

      expect(resultado.ok).toBe(false);
      expect(resultado.reason).toBe('session-expired');
      // Ni un intento más: solo se reintenta una vez.
      expect(cliente.functions.invoke).toHaveBeenCalledTimes(2);
      // La cuenta podría seguir activa en el servidor, así que se avisa sin prometer nada.
      expect(cliente.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(auth.session).toBeNull();
    });

    it('un fallo de red o del servidor deja la sesión intacta', async () => {
      for (const fallo of [
        { data: null, error: { message: 'Failed to fetch' } },
        { data: null, error: { status: 500, message: 'boom' } },
        { data: null, error: { status: 429, message: 'too many' } }
      ]) {
        cliente.functions.invoke = vi.fn().mockResolvedValue(fallo);
        cliente.auth.refreshSession = vi.fn();
        cliente.auth.signOut = vi.fn();
        const auth = montar(cliente);

        const resultado = (await auth.deleteAccount()) as Extract<DeleteAccountResult, { ok: false }>;

        expect(resultado.ok).toBe(false);
        // Sin refresco ni cierre: así se puede reintentar sin volver a iniciar sesión.
        expect(cliente.auth.refreshSession).not.toHaveBeenCalled();
        expect(cliente.auth.signOut).not.toHaveBeenCalled();
      }
    });

    it('con la pestaña bloqueada no se invoca nada', async () => {
      const auth = montar(cliente);
      setSessionBlockedFlag('other-account');

      const resultado = (await auth.deleteAccount()) as Extract<DeleteAccountResult, { ok: false }>;

      expect(resultado.reason).toBe('session-expired');
      expect(resultado.message).toMatch(/sesión cambió en otra pestaña/i);
      expect(cliente.functions.invoke).not.toHaveBeenCalled();
      expect(cliente.auth.refreshSession).not.toHaveBeenCalled();
      expect(cliente.auth.signOut).not.toHaveBeenCalled();
    });

    it('un fallo inesperado de la función se trata como red (BUG-14)', async () => {
      const auth = montar(cliente);
      // Cualquier excepción, incluso un error de programación, acaba en 'network'.
      cliente.functions.invoke = vi.fn().mockRejectedValue(new TypeError('no es una función'));

      const resultado = (await auth.deleteAccount()) as Extract<DeleteAccountResult, { ok: false }>;

      expect(resultado.reason).toBe('network');
      expect(resultado.message).toMatch(/Revisa la conexión/);
      expect(cliente.auth.signOut).not.toHaveBeenCalled();
    });
  });
});
