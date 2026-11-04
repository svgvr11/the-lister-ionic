import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockAuthService } from './mock-auth.service';
import { consumeLocalAuthChange, setSessionBlockedFlag } from '../core/auth/session-guard/session-guard';

describe('MockAuthService', () => {
  let auth: MockAuthService;

  beforeEach(() => {
    setSessionBlockedFlag(null);
    consumeLocalAuthChange();
    auth = new MockAuthService();
  });

  afterEach(() => {
    setSessionBlockedFlag(null);
    consumeLocalAuthChange();
  });

  it('inicia con sesión de demostración sin cliente real', async () => {
    expect(auth.enabled).toBe(true);
    expect(auth.mockMode).toBe(true);
    expect(auth.supabaseClient).toBeNull();
    expect(await auth.getSession()).toMatchObject({
      user: {
        id: 'mock-user-id',
        email: 'demo@thelister.test',
        user_metadata: { full_name: 'Usuario de prueba' }
      }
    });
  });

  it('permite salir y volver a entrar en modo demo', async () => {
    const changes: (string | null)[] = [];
    auth.sessionChanges.subscribe((session) => changes.push(session?.user.id ?? null));

    await auth.signOut();
    expect(auth.session).toBeNull();
    await auth.signInWithGoogle();

    expect(changes).toEqual([null, 'mock-user-id']);
    expect(auth.session?.user.id).toBe('mock-user-id');
  });

  it('marca los cambios de sesión como locales para no activar el bloqueo entre pestañas', async () => {
    await auth.signOut();
    expect(consumeLocalAuthChange()).toBe(true);
  });

  it('no realiza el borrado de cuenta real', async () => {
    await expect(auth.deleteAccount()).resolves.toMatchObject({
      ok: false,
      reason: 'network'
    });
  });
});
