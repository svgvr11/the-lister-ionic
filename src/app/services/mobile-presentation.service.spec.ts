import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MobilePresentationService } from './mobile-presentation.service';

describe('mobile-presentation: servicio de fuente única', () => {
  it('sin matchMedia cae al ancho actual de la ventana', () => {
    const originalMatchMedia = window.matchMedia;
    const originalWidth = window.innerWidth;
    try {
      // jsdom no implementa matchMedia: el servicio debe usar window.innerWidth.
      (window as { matchMedia?: typeof window.matchMedia }).matchMedia = undefined;
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
      const service = TestBed.inject(MobilePresentationService);
      expect(service.isMobile()).toBe(true);
      expect(service.snapshot()).toBe(true);
    } finally {
      (window as { matchMedia?: typeof window.matchMedia }).matchMedia = originalMatchMedia;
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
      TestBed.resetTestingModule();
    }
  });

  it('con matchMedia toma su valor inicial y lo expone igual en vivo y en instantánea', () => {
    const originalMatchMedia = window.matchMedia;
    try {
      (window as { matchMedia?: typeof window.matchMedia }).matchMedia = (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false
      }) as unknown as MediaQueryList;
      const service = TestBed.inject(MobilePresentationService);
      expect(service.isMobile()).toBe(false);
      expect(service.snapshot()).toBe(false);
    } finally {
      (window as { matchMedia?: typeof window.matchMedia }).matchMedia = originalMatchMedia;
      TestBed.resetTestingModule();
    }
  });
});
