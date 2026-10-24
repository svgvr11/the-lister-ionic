import { describe, expect, it } from 'vitest';
import {
  DELETE_CONFIRM_TEXT,
  DELETE_SESSION_EXPIRED_MESSAGE,
  classifyDeleteAccountInvoke,
  deleteAccountMessage,
  isDeleteConfirmText
} from './delete-account';
import type { DeleteAccountResponseBody, DeleteAccountInvokeError } from './delete-account';

/**
 * Pruebas de la clasificación del resultado de borrar la cuenta. Migrado desde
 * scripts/test-delete-account-result.mjs. Es lógica pura: decide qué ve el usuario
 * cuando la Edge Function contesta.
 */

describe('delete-account: clasificación del intento', () => {
  it('ok cuando la función responde { ok: true }', () => {
    expect(classifyDeleteAccountInvoke({ ok: true }, null)).toBe('ok');
    expect(deleteAccountMessage('ok')).toBe('');
  });

  it('401 se clasifica como sesión expirada', () => {
    expect(
      classifyDeleteAccountInvoke(null, { status: 401, message: 'Unauthorized' })
    ).toBe('session-expired');
    expect(
      classifyDeleteAccountInvoke({ ok: false, error: 'x' } as DeleteAccountResponseBody, {
        status: 401
      } as DeleteAccountInvokeError),
      'el estado manda sobre el cuerpo'
    ).toBe('session-expired');
    expect(deleteAccountMessage('session-expired')).toBe(DELETE_SESSION_EXPIRED_MESSAGE);
    expect(DELETE_SESSION_EXPIRED_MESSAGE).toMatch(
      /Tu sesión expiró\. Inicia sesión de nuevo y repite la eliminación si tu cuenta sigue activa\./
    );
  });

  it('sin estado se clasifica como red', () => {
    expect(classifyDeleteAccountInvoke(null, { message: 'Failed to fetch' })).toBe('network');
    expect(classifyDeleteAccountInvoke(null, { status: 0 })).toBe('network');
    expect(deleteAccountMessage('network')).toMatch(/Revisa la conexión/);
  });

  it('5xx y cuerpos raros caen en servidor', () => {
    expect(classifyDeleteAccountInvoke(null, { status: 500 })).toBe('server');
    expect(classifyDeleteAccountInvoke(null, { status: 503 })).toBe('server');
    expect(classifyDeleteAccountInvoke(null, { status: 400, message: 'raro' })).toBe('server');
    expect(classifyDeleteAccountInvoke({ ok: false, error: 'x' }, null)).toBe('server');
    expect(classifyDeleteAccountInvoke(null, null)).toBe('server');
    expect(classifyDeleteAccountInvoke(undefined, undefined)).toBe('server');
    expect(deleteAccountMessage('server')).toMatch(/Inténtalo de nuevo/);
  });
});

describe('delete-account: confirmación', () => {
  it('la confirmación exige escribir ELIMINAR', () => {
    expect(DELETE_CONFIRM_TEXT).toBe('ELIMINAR');
    expect(isDeleteConfirmText('ELIMINAR')).toBe(true);
    expect(isDeleteConfirmText('eliminar')).toBe(false);
    expect(isDeleteConfirmText(' ELIMINAR ')).toBe(true); // los bordes se recortan
    expect(isDeleteConfirmText('ELIMINAR ')).toBe(true);
    expect(isDeleteConfirmText('')).toBe(false);
    expect(isDeleteConfirmText(null)).toBe(false);
    expect(isDeleteConfirmText(undefined)).toBe(false);
    expect(isDeleteConfirmText(42)).toBe(false);
  });
});
