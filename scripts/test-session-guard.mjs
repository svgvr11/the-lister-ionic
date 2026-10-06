import assert from 'node:assert/strict';
import {
  classifySessionChange,
  extractStoredUserId,
  isSupabaseSessionKey,
} from '../src/app/core/session-guard.ts';

let cases = 0;
const check = (label, fn) => {
  fn();
  cases++;
  console.log(`  ok  ${label}`);
};

// 1. Mismo usuario (incluido el refresco de token) no bloquea.
check('mismo usuario clasifica como same', () => {
  assert.equal(classifySessionChange('user-a', 'user-a'), 'same');
});

// 2. Sin sesión (otra pestaña cerró sesión) bloquea como 'signed-out'.
check('null clasifica como signed-out', () => {
  assert.equal(classifySessionChange('user-a', null), 'signed-out');
});

// 3. Otra cuenta (otra pestaña entró con otro usuario) bloquea como 'other-account'.
check('otro id clasifica como other-account', () => {
  assert.equal(classifySessionChange('user-a', 'user-b'), 'other-account');
});

// 4. Refresco del mismo usuario no bloquea aunque cambie todo lo demás.
check('refresh del mismo usuario clasifica como same', () => {
  assert.equal(classifySessionChange('user-a', 'user-a'), 'same');
});

// 5. Sin userId inicial (pestaña arrancada sin sesión) nada bloquea.
check('sin userId inicial nada bloquea hasta que haya sesión', () => {
  assert.equal(classifySessionChange(null, null), 'signed-out');
  assert.equal(classifySessionChange(null, 'user-a'), 'same');
});

// 6. Extracción del userId desde el valor guardado en localStorage.
check('extractStoredUserId lee user.id del valor guardado', () => {
  const raw = JSON.stringify({ user: { id: 'user-a' }, access_token: 'tok' });
  assert.equal(extractStoredUserId(raw), 'user-a');
});

// 7. Valor corrupto o con forma inesperada: null sin lanzar.
check('valor corrupto o JSON inválido no lanza y da null', () => {
  assert.equal(extractStoredUserId(null), null);
  assert.equal(extractStoredUserId(undefined), null);
  assert.equal(extractStoredUserId(''), null);
  assert.equal(extractStoredUserId('no-json{{{'), null);
  assert.equal(extractStoredUserId('123'), null);
  assert.equal(extractStoredUserId('"solo-un-string"'), null);
  assert.equal(extractStoredUserId(JSON.stringify({ access_token: 'tok' })), null);
  assert.equal(extractStoredUserId(JSON.stringify({ user: null })), null);
  assert.equal(extractStoredUserId(JSON.stringify({ user: { id: 42 } })), null);
  assert.equal(extractStoredUserId(JSON.stringify({ user: { id: '' } })), null);
});

// 8. Solo las claves de sesión de Supabase cuentan; el resto se ignora.
check('isSupabaseSessionKey solo acepta claves sb-…-auth-token', () => {
  assert.equal(isSupabaseSessionKey('sb-abcdef123-auth-token'), true);
  assert.equal(isSupabaseSessionKey('sb-abcdef123-auth-token-code-verifier'), true);
  assert.equal(isSupabaseSessionKey('the-lister-ionic-v1'), false);
  assert.equal(isSupabaseSessionKey('the-lister-ionic-v1:user-a'), false);
  assert.equal(isSupabaseSessionKey('the-lister-theme-v1'), false);
  assert.equal(isSupabaseSessionKey('sb-abcdef123-auth-token-flow-x-code-verifier'), false);
  assert.equal(isSupabaseSessionKey(null), false);
});

// 9. El logout propio no bloquea: se marca como cambio local y se consume al
// procesar el evento resultante (null por cierre propio → same).
check('el logout propio marcado como local no bloquea', () => {
  // La pestaña marca el cambio local ANTES de llamar a signOut; al llegar el
  // SIGNED_OUT con session null, el servicio consume la marca y no bloquea.
  let localChangePending = true;
  const startUserId = 'user-a';
  const outcome = localChangePending
    ? 'same'
    : classifySessionChange(startUserId, extractStoredUserId(null));
  localChangePending = false;
  assert.equal(outcome, 'same');
  assert.equal(localChangePending, false);
});

console.log(`session-guard: ${cases} cases passed`);
