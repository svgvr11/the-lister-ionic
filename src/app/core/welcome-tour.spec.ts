import { describe, expect, it } from 'vitest';
import {
  WELCOME_DESKTOP_MIN_WIDTH,
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
  welcomePrimaryLabel,
  welcomeSeenKey
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
  isNative: false,
  width: 1280,
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

describe('welcome-tour: cuándo aparece', () => {
  it('se muestra en escritorio web, sin marca, sin overlay y con sesión', () => {
    expect(shouldShowWelcome(visibles)).toBe(true);
  });

  it('no se muestra en la app nativa', () => {
    expect(shouldShowWelcome({ ...visibles, isNative: true })).toBe(false);
  });

  it('no se muestra en pantallas de 700px o menos', () => {
    expect(shouldShowWelcome({ ...visibles, width: WELCOME_DESKTOP_MIN_WIDTH })).toBe(false);
    expect(shouldShowWelcome({ ...visibles, width: WELCOME_DESKTOP_MIN_WIDTH - 1 })).toBe(false);
    expect(shouldShowWelcome({ ...visibles, width: WELCOME_DESKTOP_MIN_WIDTH + 1 })).toBe(true);
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
  it('avanza y retrocede con límites', () => {
    expect(nextWelcomePage(0)).toBe(1);
    expect(nextWelcomePage(WELCOME_TOUR_PAGE_COUNT - 1)).toBe(WELCOME_TOUR_PAGE_COUNT - 1);
    expect(previousWelcomePage(2)).toBe(1);
    expect(previousWelcomePage(0)).toBe(0);
  });

  it('reconoce la primera y la última página', () => {
    expect(isWelcomeFirstPage(0)).toBe(true);
    expect(isWelcomeFirstPage(1)).toBe(false);
    expect(isWelcomeLastPage(WELCOME_TOUR_PAGE_COUNT - 1)).toBe(true);
    expect(isWelcomeLastPage(WELCOME_TOUR_PAGE_COUNT - 2)).toBe(false);
  });
});

describe('welcome-tour: textos', () => {
  it('el botón principal dice "Siguiente" hasta la última página', () => {
    expect(welcomePrimaryLabel(0)).toBe('Siguiente');
    expect(welcomePrimaryLabel(1)).toBe('Siguiente');
    expect(welcomePrimaryLabel(2)).toBe('Siguiente');
    expect(welcomePrimaryLabel(WELCOME_TOUR_PAGE_COUNT - 1)).toBe('¡Empezar a organizar!');
  });

  it('el contador y el anuncio numeran las páginas', () => {
    expect(welcomePageCounter(0)).toBe('1 de 4');
    expect(welcomePageCounter(3)).toBe('4 de 4');
    expect(welcomePageAnnouncement(1, WELCOME_TOUR_PAGE_COUNT, 'Control y Enfoque Total'))
      .toBe('Página 2 de 4: Control y Enfoque Total');
  });

  it('el atajo ⌘K solo se menciona en macOS', () => {
    expect(unifiedSearchCardText(true)).toContain('⌘K');
    expect(unifiedSearchCardText(false)).not.toContain('⌘K');
    expect(unifiedSearchCardText(false)).toContain('buscador global');
  });
});
