import { describe, expect, it } from 'vitest';
import { OverlayStack } from '../core/ui/overlay-stack/overlay-stack';

/**
 * Pruebas de la pila de overlays. Migrado desde scripts/test-overlay-stack.mjs.
 * El botón atrás de Android cierra la capa de arriba, no todas a la vez.
 */

describe('overlay-stack', () => {
  it('cierra solo la capa de arriba y en orden', () => {
    const stack = new OverlayStack();
    const closed: string[] = [];

    stack.register('focus', () => closed.push('focus'));
    stack.register('remove', () => closed.push('remove'));
    expect(stack.size).toBe(2);
    expect(stack.topId).toBe('remove');
    expect(stack.closeTop()).toBe('closed');
    expect(closed).toEqual(['remove']);
    expect(stack.topId).toBe('focus');
  });

  it('una capa no descartable bloquea el cierre', () => {
    const stack = new OverlayStack();
    const closed: string[] = [];

    stack.register('focus', () => closed.push('focus'));
    stack.register('session-blocked', () => closed.push('blocked'), false);
    expect(stack.closeTop()).toBe('blocked');
    expect(stack.topId).toBe('session-blocked');
    expect(closed).toEqual([]);
  });

  it('al retirar la capa bloqueada se reanuda el cierre normal', () => {
    const stack = new OverlayStack();
    const closed: string[] = [];

    stack.register('focus', () => closed.push('focus'));
    stack.register('session-blocked', () => closed.push('blocked'), false);
    expect(stack.closeTop()).toBe('blocked');
    expect(stack.unregister('session-blocked')).toBe(true);
    expect(stack.closeTop()).toBe('closed');
    expect(closed).toEqual(['focus']);
    expect(stack.closeTop()).toBe('empty');
  });

  it('el registro devuelve un baja que solo retira una vez', () => {
    const stack = new OverlayStack();
    const closed: string[] = [];

    const unregister = stack.register('archive:help', () => closed.push('help'));
    expect(unregister()).toBe(true);
    expect(unregister()).toBe(false);
    expect(stack.size).toBe(0);
  });

  it('unregisterPrefix retira todas las capas de un prefijo', () => {
    const stack = new OverlayStack();
    const closed: string[] = [];

    stack.register('board:menu', () => closed.push('menu'));
    stack.register('board:focus', () => closed.push('focus'));
    stack.unregisterPrefix('board:');
    expect(stack.size).toBe(0);
  });
});
