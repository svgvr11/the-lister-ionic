import assert from 'node:assert/strict';
import { buildGoogleOAuthOptions } from '../src/app/core/google-auth.ts';

let cases = 0;
const check = (label, fn) => {
  fn();
  cases++;
  console.log(`  ok  ${label}`);
};

// 1. Siempre se pide el selector de cuenta, en nativo y en web.
check('Google muestra siempre el selector de cuenta', () => {
  for (const isNative of [true, false]) {
    const options = buildGoogleOAuthOptions(isNative, 'https://x');
    assert.equal(options.queryParams.prompt, 'select_account');
  }
});

// 2. El redirect y el skipBrowserRedirect dependen de la plataforma.
check('redirect y skipBrowserRedirect por plataforma', () => {
  const nativo = buildGoogleOAuthOptions(true, 'dev.vmunoz.thelister://auth/callback');
  assert.equal(nativo.redirectTo, 'dev.vmunoz.thelister://auth/callback');
  assert.equal(nativo.skipBrowserRedirect, true);

  const web = buildGoogleOAuthOptions(false, 'https://thelister.atenis.app');
  assert.equal(web.redirectTo, 'https://thelister.atenis.app');
  assert.equal(web.skipBrowserRedirect, false);
});

console.log(`google-auth: ${cases} cases passed`);
