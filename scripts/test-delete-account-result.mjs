import assert from 'node:assert/strict';
import {
  DELETE_CONFIRM_TEXT,
  DELETE_SESSION_EXPIRED_MESSAGE,
  classifyDeleteAccountInvoke,
  deleteAccountMessage,
  isDeleteConfirmText,
} from '../src/app/core/delete-account.ts';

let cases = 0;
const check = (label, fn) => {
  fn();
  cases++;
  console.log(`  ok  ${label}`);
};

// 1. Éxito: sin error y data.ok.
check('ok cuando la función responde { ok: true }', () => {
  assert.equal(classifyDeleteAccountInvoke({ ok: true }, null), 'ok');
  assert.equal(deleteAccountMessage('ok'), '');
});

// 2. 401: sesión expirada.
check('401 se clasifica como sesión expirada', () => {
  assert.equal(classifyDeleteAccountInvoke(null, { status: 401, message: 'Unauthorized' }), 'session-expired');
  assert.equal(
    classifyDeleteAccountInvoke({ ok: false, error: 'x' }, { status: 401 }),
    'session-expired',
    'el estado manda sobre el cuerpo'
  );
  assert.equal(deleteAccountMessage('session-expired'), DELETE_SESSION_EXPIRED_MESSAGE);
  assert.match(
    DELETE_SESSION_EXPIRED_MESSAGE,
    /Tu sesión expiró\. Inicia sesión de nuevo y repite la eliminación si tu cuenta sigue activa\./
  );
});

// 3. Sin estado: error de red.
check('sin estado se clasifica como red', () => {
  assert.equal(classifyDeleteAccountInvoke(null, { message: 'Failed to fetch' }), 'network');
  assert.equal(classifyDeleteAccountInvoke(null, { status: 0 }), 'network');
  assert.match(deleteAccountMessage('network'), /Revisa la conexión/);
});

// 4. 5xx y respuestas inesperadas: servidor, sesión intacta.
check('5xx y cuerpos raros caen en servidor', () => {
  assert.equal(classifyDeleteAccountInvoke(null, { status: 500 }), 'server');
  assert.equal(classifyDeleteAccountInvoke(null, { status: 503 }), 'server');
  assert.equal(classifyDeleteAccountInvoke(null, { status: 400, message: 'raro' }), 'server');
  assert.equal(classifyDeleteAccountInvoke({ ok: false, error: 'x' }, null), 'server');
  assert.equal(classifyDeleteAccountInvoke(null, null), 'server');
  assert.equal(classifyDeleteAccountInvoke(undefined, undefined), 'server');
  assert.match(deleteAccountMessage('server'), /Inténtalo de nuevo/);
});

// 5. Confirmación: solo el literal exacto.
check('la confirmación exige escribir ELIMINAR', () => {
  assert.equal(DELETE_CONFIRM_TEXT, 'ELIMINAR');
  assert.equal(isDeleteConfirmText('ELIMINAR'), true);
  assert.equal(isDeleteConfirmText('eliminar'), false);
  assert.equal(isDeleteConfirmText(' ELIMINAR '), true, 'los bordes se recortan');
  assert.equal(isDeleteConfirmText('ELIMINAR '), true);
  assert.equal(isDeleteConfirmText(''), false);
  assert.equal(isDeleteConfirmText(null), false);
  assert.equal(isDeleteConfirmText(undefined), false);
  assert.equal(isDeleteConfirmText(42), false);
});

console.log(`delete-account-result: ${cases} cases passed`);
