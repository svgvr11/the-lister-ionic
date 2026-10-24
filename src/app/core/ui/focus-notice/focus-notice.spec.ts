import { describe, expect, it } from 'vitest';
import { focusListRemovalMessage } from './focus-notice';

/**
 * Pruebas de los avisos del modal de foco. Migrado desde scripts/test-focus-notice.mjs.
 * Cuando la lista abierta desaparece, el mensaje explica por qué.
 */

describe('focus-notice', () => {
  it('una lista archivada se anuncia como archivada', () => {
    expect(focusListRemovalMessage('archived')).toBe('La lista fue archivada');
  });

  it('una lista eliminada se anuncia como eliminada', () => {
    expect(focusListRemovalMessage('trashed')).toBe('La lista fue eliminada');
  });

  it('una lista que ya no está se anuncia como no disponible', () => {
    expect(focusListRemovalMessage('remote')).toBe('La lista ya no está disponible');
  });
});
