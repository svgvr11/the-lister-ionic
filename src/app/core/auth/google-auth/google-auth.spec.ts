import { describe, expect, it } from 'vitest';
import { buildGoogleOAuthOptions } from './google-auth';

/**
 * Pruebas de las opciones de Google OAuth. Migrado desde scripts/test-google-auth.mjs.
 * El `prompt: select_account` es lo que obliga a Google a mostrar el selector de cuenta.
 */

describe('google-auth', () => {
  it('Google muestra siempre el selector de cuenta', () => {
    for (const isNative of [true, false]) {
      const options = buildGoogleOAuthOptions(isNative, 'https://x');
      expect(options.queryParams.prompt).toBe('select_account');
    }
  });

  it('redirect y skipBrowserRedirect por plataforma', () => {
    const nativo = buildGoogleOAuthOptions(true, 'dev.vmunoz.thelister://auth/callback');
    expect(nativo.redirectTo).toBe('dev.vmunoz.thelister://auth/callback');
    expect(nativo.skipBrowserRedirect).toBe(true);

    const web = buildGoogleOAuthOptions(false, 'https://thelister.atenis.app');
    expect(web.redirectTo).toBe('https://thelister.atenis.app');
    expect(web.skipBrowserRedirect).toBe(false);
  });
});
