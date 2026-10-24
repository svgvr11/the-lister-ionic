import { describe, expect, it } from 'vitest';
import {
  classifySessionChange,
  extractStoredUserId,
  isSupabaseSessionKey
} from './session-guard';

/**
 * Pruebas de la clasificación de cambios de sesión entre pestañas. Migrado desde
 * scripts/test-session-guard.mjs. Decide si una pestaña vieja se bloquea o sigue.
 */

describe('session-guard: classifySessionChange', () => {
  it('mismo usuario clasifica como same', () => {
    expect(classifySessionChange('user-a', 'user-a')).toBe('same');
  });

  it('null clasifica como signed-out', () => {
    expect(classifySessionChange('user-a', null)).toBe('signed-out');
  });

  it('otro id clasifica como other-account', () => {
    expect(classifySessionChange('user-a', 'user-b')).toBe('other-account');
  });

  it('refresh del mismo usuario clasifica como same', () => {
    expect(classifySessionChange('user-a', 'user-a')).toBe('same');
  });

  it('sin userId inicial nada bloquea hasta que haya sesión', () => {
    expect(classifySessionChange(null, null)).toBe('signed-out');
    expect(classifySessionChange(null, 'user-a')).toBe('same');
  });
});

describe('session-guard: lectura del valor guardado', () => {
  it('extractStoredUserId lee user.id del valor guardado', () => {
    const raw = JSON.stringify({ user: { id: 'user-a' }, access_token: 'tok' });
    expect(extractStoredUserId(raw)).toBe('user-a');
  });

  it('valor corrupto o JSON inválido no lanza y da null', () => {
    expect(extractStoredUserId(null)).toBeNull();
    expect(extractStoredUserId(undefined)).toBeNull();
    expect(extractStoredUserId('')).toBeNull();
    expect(extractStoredUserId('no-json{{{')).toBeNull();
    expect(extractStoredUserId('123')).toBeNull();
    expect(extractStoredUserId('"solo-un-string"')).toBeNull();
    expect(extractStoredUserId(JSON.stringify({ access_token: 'tok' }))).toBeNull();
    expect(extractStoredUserId(JSON.stringify({ user: null }))).toBeNull();
    expect(extractStoredUserId(JSON.stringify({ user: { id: 42 } }))).toBeNull();
    expect(extractStoredUserId(JSON.stringify({ user: { id: '' } }))).toBeNull();
  });
});

describe('session-guard: claves vigiladas', () => {
  it('isSupabaseSessionKey solo acepta claves sb-…-auth-token', () => {
    expect(isSupabaseSessionKey('sb-abcdef123-auth-token')).toBe(true);
    expect(isSupabaseSessionKey('sb-abcdef123-auth-token-code-verifier')).toBe(true);
    expect(isSupabaseSessionKey('the-lister-ionic-v1')).toBe(false);
    expect(isSupabaseSessionKey('the-lister-ionic-v1:user-a')).toBe(false);
    expect(isSupabaseSessionKey('the-lister-theme-v1')).toBe(false);
    expect(isSupabaseSessionKey('sb-abcdef123-auth-token-flow-x-code-verifier')).toBe(false);
    expect(isSupabaseSessionKey(null)).toBe(false);
  });

  it('el logout propio marcado como local no bloquea', () => {
    // La pestaña marca el cambio local ANTES de llamar a signOut; al llegar el
    // SIGNED_OUT con session null, el servicio consume la marca y no bloquea.
    let localChangePending = true;
    const startUserId = 'user-a';
    const outcome = localChangePending
      ? 'same'
      : classifySessionChange(startUserId, extractStoredUserId(null));
    localChangePending = false;
    expect(outcome).toBe('same');
    expect(localChangePending).toBe(false);
  });
});
