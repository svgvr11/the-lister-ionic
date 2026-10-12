import { Capacitor } from '@capacitor/core';

/**
 * RECORRIDO DE BIENVENIDA (lógica pura).
 *
 * Reglas de aparición decididas para el modal de 4 páginas:
 *  - Solo ESCRITORIO web: nunca en nativo ni en pantallas de 700px o menos.
 *  - Una vez por dispositivo Y usuario: la marca se guarda en una clave propia de
 *    localStorage que lleva el userId dentro, con el mismo patrón (y el mismo
 *    try/catch) que el tablero local y el tema.
 *  - Solo con sesión iniciada, con el tablero ya cargado y sin ningún otro overlay
 *    abierto: si hay otro, el tablero espera (él marca `welcomeTourDeferred`).
 *  - Si el almacenamiento falla, NO se muestra: nunca entra en un bucle de avisos.
 *
 * Nada de esto toca el tablero ni se sincroniza: la marca es local.
 */

/** Número de páginas del recorrido. */
export const WELCOME_TOUR_PAGE_COUNT = 4;

/** Ancho mínimo EXCLUSIVO para considerarse escritorio (≤700px no lo es). */
export const WELCOME_DESKTOP_MIN_WIDTH = 700;

/** Prefijo de la clave de la marca; el usuario va dentro de la clave. */
export const WELCOME_TOUR_STORAGE_PREFIX = 'the-lister-welcome-v1';

/** Valor con el que se marca el recorrido como visto. */
export const WELCOME_TOUR_SEEN_VALUE = '1';

/** Almacenamiento inyectable, para poder probarlo sin navegador. */
export interface WelcomeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Estado de la marca. `error` es aparte de `unseen` a propósito: un almacenamiento
 * roto (modo privado, WebView sin DOM storage) no debe mostrar el recorrido, mientras
 * que una marca simplemente ausente sí lo hace la primera vez.
 */
export type WelcomeSeenState = 'seen' | 'unseen' | 'error';

/**
 * Clave POR USUARIO de la marca de bienvenida, con el mismo patrón que la clave del
 * tablero local (`the-lister-ionic-v1:<userId>`): sin sesión se usa `local` para no
 * perder la marca en dispositivos sin cuenta.
 */
export function welcomeSeenKey(userId: string | null): string {
  return `${WELCOME_TOUR_STORAGE_PREFIX}:${userId ?? 'local'}`;
}

/** localStorage real, o null si el entorno no lo ofrece. Nunca lanza. */
function browserStorage(): WelcomeStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Algunos WebView/entornos sin almacenamiento lanzan al tocar el objeto.
    return null;
  }
}

/**
 * Lee la marca de este usuario. Un valor inválido se trata como «no visto» (por ejemplo
 * tras cambiar el formato), pero un almacenamiento que lanza devuelve `error`, que el
 * llamador interpreta como «no mostrar».
 */
export function readWelcomeSeen(userId: string | null, storage?: WelcomeStorage | null): WelcomeSeenState {
  try {
    const raw = (storage ?? browserStorage())?.getItem(welcomeSeenKey(userId));
    if (raw === null || raw === undefined) return 'unseen';
    return raw === WELCOME_TOUR_SEEN_VALUE ? 'seen' : 'unseen';
  } catch {
    return 'error';
  }
}

/** Marca el recorrido como visto para este usuario. Nunca lanza. */
export function markWelcomeSeen(userId: string | null, storage?: WelcomeStorage | null): void {
  try {
    (storage ?? browserStorage())?.setItem(welcomeSeenKey(userId), WELCOME_TOUR_SEEN_VALUE);
  } catch {
    // Si no se puede guardar, esta sesión ya no lo repite: el resto queda como estaba.
  }
}

/** Las cinco condiciones que deciden si el recorrido aparece al cargar el tablero. */
export interface WelcomeVisibility {
  /** App nativa (APK): nunca se muestra. */
  isNative: boolean;
  /** Ancho del viewport en px; 700 o menos no es escritorio. */
  width: number;
  /** Estado de la marca de este usuario (`error` tampoco muestra). */
  seen: WelcomeSeenState;
  /** Hay otro overlay abierto (o el tablero aún no ha podido comprobarlo). */
  hasOverlay: boolean;
  /** Hay sesión iniciada. */
  hasSession: boolean;
}

/**
 * true solo si se cumplen las cinco condiciones: escritorio web, marca ausente,
 * sin otro overlay y con sesión. Pura y sin DOM.
 */
export function shouldShowWelcome(conditions: WelcomeVisibility): boolean {
  if (conditions.isNative) return false;
  if (!(conditions.width > WELCOME_DESKTOP_MIN_WIDTH)) return false;
  if (conditions.seen !== 'unseen') return false;
  if (conditions.hasOverlay) return false;
  if (!conditions.hasSession) return false;
  return true;
}

/** Avanza una página sin pasarse de la última. */
export function nextWelcomePage(current: number, total: number = WELCOME_TOUR_PAGE_COUNT): number {
  return Math.min(current + 1, total - 1);
}

/** Retrocede una página sin bajar de la primera. */
export function previousWelcomePage(current: number): number {
  return Math.max(current - 1, 0);
}

/** El recorrido está en su primera página. */
export function isWelcomeFirstPage(current: number): boolean {
  return current <= 0;
}

/** El recorrido está en su última página. */
export function isWelcomeLastPage(current: number, total: number = WELCOME_TOUR_PAGE_COUNT): boolean {
  return current >= total - 1;
}

/**
 * Texto del botón principal: «Siguiente» en todas las páginas menos en la última,
 * donde cierra el recorrido.
 */
export function welcomePrimaryLabel(current: number, total: number = WELCOME_TOUR_PAGE_COUNT): string {
  return isWelcomeLastPage(current, total) ? '¡Empezar a organizar!' : 'Siguiente';
}

/** Contador de la cabecera: «1 de 4». */
export function welcomePageCounter(current: number, total: number = WELCOME_TOUR_PAGE_COUNT): string {
  return `${current + 1} de ${total}`;
}

/** Anuncio de la región viva al cambiar de página. */
export function welcomePageAnnouncement(current: number, total: number, title: string): string {
  return `Página ${current + 1} de ${total}: ${title}`;
}

/**
 * Texto de la tarjeta «Búsqueda unificada». El atajo ⌘K solo existe en el navegador
 * de macOS: en Windows, Linux y en la app nativa no se menciona.
 */
export function unifiedSearchCardText(isMacOs: boolean): string {
  const base = 'Encuentra al instante cualquier tarea o lista mediante el buscador global';
  return isMacOs ? `${base} con el atajo ⌘K (solo en macOS).` : `${base}.`;
}

/**
 * Detecta el navegador de macOS. `userAgentData` es la API moderna y da la plataforma
 * real ("macOS"); `navigator.platform` es la respaldo para navegadores antiguos. En la
 * app nativa no se registra ningún atajo de teclado, así que devuelve false.
 */
export function isMacOsBrowser(): boolean {
  if (typeof navigator === 'undefined' || Capacitor.isNativePlatform()) return false;
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
  return /mac/i.test(platform ?? navigator.platform ?? '');
}
