import { describe, expect, it } from 'vitest';
import {
  assertRealSupabaseClientAllowed,
  assertValidRuntimeMode,
  isMockMode
} from './runtime-mode';

describe('runtime-mode', () => {
  it('identifica solo el modo mock explícito', () => {
    expect(isMockMode({ production: false, mockMode: true })).toBe(true);
    expect(isMockMode({ production: false })).toBe(false);
  });

  it('rechaza production y mockMode simultáneos', () => {
    expect(() => assertValidRuntimeMode({ production: true, mockMode: true }))
      .toThrow(/mockMode no puede activarse en producción/);
  });

  it('rechaza crear el cliente real en mock y permite los modos normales', () => {
    expect(() => assertRealSupabaseClientAllowed({ production: false, mockMode: true }))
      .toThrow(/no puede utilizarse en modo mock/);
    expect(() => assertRealSupabaseClientAllowed({ production: true, mockMode: false })).not.toThrow();
    expect(() => assertRealSupabaseClientAllowed({ production: false })).not.toThrow();
  });
});
