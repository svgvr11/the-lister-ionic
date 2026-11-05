import { describe, expect, it } from 'vitest';
import {
  MOBILE_PRESENTATION_MAX_WIDTH,
  isMobilePresentationWidth
} from './mobile-presentation';

describe('mobile-presentation: umbral único', () => {
  it('usa 700 px como ancho máximo de la presentación móvil', () => {
    expect(MOBILE_PRESENTATION_MAX_WIDTH).toBe(700);
  });

  it('es móvil hasta 700 px inclusive', () => {
    expect(isMobilePresentationWidth(320)).toBe(true);
    expect(isMobilePresentationWidth(700)).toBe(true);
  });

  it('es escritorio desde 701 px', () => {
    expect(isMobilePresentationWidth(701)).toBe(false);
    expect(isMobilePresentationWidth(1280)).toBe(false);
  });

  it('un ancho no finito se trata como móvil (mismo criterio que welcomeVariant)', () => {
    expect(isMobilePresentationWidth(Number.NaN)).toBe(true);
    expect(isMobilePresentationWidth(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
