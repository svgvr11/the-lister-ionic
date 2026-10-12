import { describe, expect, it } from 'vitest';
import {
  WELCOME_DESKTOP_MIN_WIDTH,
  WELCOME_TOUR_MOBILE_PAGE_COUNT,
  WELCOME_TOUR_PAGE_COUNT,
  WELCOME_TOUR_SEEN_VALUE,
  WELCOME_TOUR_STORAGE_PREFIX,
  isWelcomeFirstPage,
  isWelcomeLastPage,
  markWelcomeSeen,
  nextWelcomePage,
  previousWelcomePage,
  readWelcomeSeen,
  shouldShowWelcome,
  unifiedSearchCardText,
  welcomePageAnnouncement,
  welcomePageCounter,
  welcomePageCount,
  welcomePrimaryLabel,
  welcomeSeenKey,
  welcomeVariant
} from './welcome-tour';
import type { WelcomeStorage } from './welcome-tour';

/**
 * Pruebas del recorrido de bienvenida. El almacenamiento se simula igual que en
 * board-view.spec.ts (válido, ausente, inválido y uno que lanza).
 */

const fakeStorage = (): WelcomeStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => data.set(key, String(value))
  };
};

const brokenStorage = (): WelcomeStorage => ({
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  }
});

const visibles = {
  seen: 'unseen' as const,
  hasOverlay: false,
  hasSession: true
};

describe('welcome-tour: clave por usuario', () => {
  it('la clave lleva el userId dentro', () => {
    expect(welcomeSeenKey('abc')).toBe(`${WELCOME_TOUR_STORAGE_PREFIX}:abc`);
    expect(welcomeSeenKey(null)).toBe(`${WELCOME_TOUR_STORAGE_PREFIX}:local`);
  });

  it('una marca ausente es "unseen"', () => {
    expect(readWelcomeSeen('u1', fakeStorage())).toBe('unseen');
  });

  it('una marca válida es "seen"', () => {
    const storage = fakeStorage();
    markWelcomeSeen('u1', storage);
    expect(storage.getItem(welcomeSeenKey('u1'))).toBe(WELCOME_TOUR_SEEN_VALUE);
    expect(readWelcomeSeen('u1', storage)).toBe('seen');
  });

  it('la marca es por usuario: no se comparte entre cuentas', () => {
    const storage = fakeStorage();
    markWelcomeSeen('u1', storage);
    expect(readWelcomeSeen('u2', storage)).toBe('unseen');
  });

  it('la misma marca sirve para las dos variantes (móvil y escritorio)', () => {
    const storage = fakeStorage();
    // Vista en escritorio: la marca queda puesta para el usuario, sin distinguir variante.
    markWelcomeSeen('u1', storage);
    expect(readWelcomeSeen('u1', storage)).toBe('seen');
    expect(welcomeVariant({ isNative: false, width: 1280 })).toBe('desktop');
    expect(welcomeVariant({ isNative: true, width: 1280 })).toBe('mobile');
    // Al entrar en el móvil del mismo usuario la marca sigue puesta.
    expect(readWelcomeSeen('u1', storage)).toBe('seen');
  });

  it('un valor inválido se trata como no visto', () => {
    const storage = fakeStorage();
    storage.setItem(welcomeSeenKey('u1'), 'true');
    expect(readWelcomeSeen('u1', storage)).toBe('unseen');
  });

  it('un almacenamiento que lanza devuelve "error" y markWelcomeSeen no rompe', () => {
    const roto = brokenStorage();
    expect(readWelcomeSeen('u1', roto)).toBe('error');
    expect(() => markWelcomeSeen('u1', roto)).not.toThrow();
  });
});

describe('welcome-tour: variante', () => {
  it('la app nativa usa la variante móvil', () => {
    expect(welcomeVariant({ isNative: true, width: 1280 })).toBe('mobile');
  });

  it('la web usa móvil en 700px o menos y escritorio por encima', () => {
    expect(welcomeVariant({ isNative: false, width: WELCOME_DESKTOP_MIN_WIDTH })).toBe('mobile');
    expect(welcomeVariant({ isNative: false, width: WELCOME_DESKTOP_MIN_WIDTH - 1 })).toBe('mobile');
    expect(welcomeVariant({ isNative: false, width: WELCOME_DESKTOP_MIN_WIDTH + 1 })).toBe('desktop');
  });

  it('cada variante tiene su número de páginas', () => {
    expect(welcomePageCount('desktop')).toBe(WELCOME_TOUR_PAGE_COUNT);
    expect(welcomePageCount('mobile')).toBe(WELCOME_TOUR_MOBILE_PAGE_COUNT);
    expect(WELCOME_TOUR_PAGE_COUNT).toBe(4);
    expect(WELCOME_TOUR_MOBILE_PAGE_COUNT).toBe(3);
  });
});

describe('welcome-tour: cuándo aparece', () => {
  it('se muestra sin marca, sin overlay y con sesión', () => {
    expect(shouldShowWelcome(visibles)).toBe(true);
  });

  it('se muestra también en la app nativa (variante móvil)', () => {
    expect(shouldShowWelcome({ ...visibles })).toBe(true);
  });

  it('no se muestra si ya está visto', () => {
    expect(shouldShowWelcome({ ...visibles, seen: 'seen' })).toBe(false);
  });

  it('no se muestra si el almacenamiento falla (nunca en bucle)', () => {
    expect(shouldShowWelcome({ ...visibles, seen: 'error' })).toBe(false);
  });

  it('no se muestra con otro overlay abierto', () => {
    expect(shouldShowWelcome({ ...visibles, hasOverlay: true })).toBe(false);
  });

  it('no se muestra sin sesión iniciada', () => {
    expect(shouldShowWelcome({ ...visibles, hasSession: false })).toBe(false);
  });
});

describe('welcome-tour: navegación', () => {
  it('avanza y retrocede con límites en las cuatro páginas', () => {
    expect(nextWelcomePage(0)).toBe(1);
    expect(nextWelcomePage(WELCOME_TOUR_PAGE_COUNT - 1)).toBe(WELCOME_TOUR_PAGE_COUNT - 1);
    expect(previousWelcomePage(2)).toBe(1);
    expect(previousWelcomePage(0)).toBe(0);
    expect(isWelcomeFirstPage(0)).toBe(true);
    expect(isWelcomeLastPage(WELCOME_TOUR_PAGE_COUNT - 1)).toBe(true);
    expect(isWelcomeLastPage(WELCOME_TOUR_PAGE_COUNT - 2)).toBe(false);
  });

  it('avanza y retrocede con límites en los tres slides del móvil', () => {
    const total = welcomePageCount('mobile');
    expect(nextWelcomePage(0, total)).toBe(1);
    expect(nextWelcomePage(total - 1, total)).toBe(total - 1);
    expect(previousWelcomePage(2)).toBe(1);
    expect(isWelcomeLastPage(total - 1, total)).toBe(true);
    expect(isWelcomeFirstPage(0)).toBe(true);
  });
});

describe('welcome-tour: textos', () => {
  it('el botón principal dice "Siguiente" hasta la última página', () => {
    expect(welcomePrimaryLabel(0, 4)).toBe('Siguiente');
    expect(welcomePrimaryLabel(1, 4)).toBe('Siguiente');
    expect(welcomePrimaryLabel(2, 4)).toBe('Siguiente');
    expect(welcomePrimaryLabel(WELCOME_TOUR_PAGE_COUNT - 1, WELCOME_TOUR_PAGE_COUNT)).toBe('¡Empezar a organizar!');
    // En móvil la frase final se acorta sin cambiar su significado.
    expect(welcomePrimaryLabel(0, 3, 'mobile')).toBe('Siguiente');
    expect(welcomePrimaryLabel(WELCOME_TOUR_MOBILE_PAGE_COUNT - 1, WELCOME_TOUR_MOBILE_PAGE_COUNT, 'mobile'))
      .toBe('¡Empezar!');
  });

  it('el contador y el anuncio numeran las páginas de cada variante', () => {
    expect(welcomePageCounter(0, 4)).toBe('1 de 4');
    expect(welcomePageCounter(3, 4)).toBe('4 de 4');
    expect(welcomePageCounter(0, 3)).toBe('1 de 3');
    expect(welcomePageCounter(2, 3)).toBe('3 de 3');
    expect(welcomePageAnnouncement(1, 3, 'Control y Organización')).toBe('Página 2 de 3: Control y Organización');
  });

  it('el atajo ⌘K solo se menciona en macOS', () => {
    expect(unifiedSearchCardText(true)).toContain('⌘K');
    expect(unifiedSearchCardText(false)).not.toContain('⌘K');
    expect(unifiedSearchCardText(false)).toContain('buscador global');
  });
});
