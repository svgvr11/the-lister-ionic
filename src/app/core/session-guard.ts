/**
 * Guardia de sesión entre pestañas (web): lógica pura y sin dependencias.
 *
 * En web, supabase-js comparte la sesión por localStorage (`sb-<ref>-auth-token`)
 * entre pestañas y propaga los cambios por BroadcastChannel. Si la pestaña B cierra
 * sesión o entra con otra cuenta, la pestaña A recibe el cambio por
 * `onAuthStateChange`. Sin este guardia, A seguiría mostrando el tablero de la
 * cuenta anterior y podría guardar datos con el token de la otra cuenta.
 *
 * Este archivo concentra la clasificación en funciones puras para poder probarlas en
 * Node con `scripts/test-session-guard.mjs`. La parte reactiva (signals, listeners)
 * vive en `SessionGuardService`.
 */

/** Cómo ha cambiado la sesión compartida respecto al userId con el que arrancó la pestaña. */
export type SessionChangeKind = 'same' | 'signed-out' | 'other-account';

/** Estado de bloqueo de la pestaña: null = operativa; el resto, bloqueada con modal. */
export type SessionBlockedState = null | 'signed-out' | 'other-account';

/**
 * Marca de cambio local a nivel de módulo (NO un servicio: evita el ciclo
 * AuthService ↔ SessionGuardService, ya que el guardia inyecta AuthService).
 *
 * Las acciones propias de ESTA pestaña (logout, login, eliminar cuenta) la activan
 * ANTES de tocar Supabase; el guardia la consume al procesar el evento resultante
 * y no bloquea. Los cambios de OTRA pestaña llegan sin la marca y sí bloquean.
 */
let localAuthChangePending = false;

/** Activa la marca: el próximo cambio de sesión lo provoca ESTA pestaña. */
export function markLocalAuthChange(): void {
  localAuthChangePending = true;
}

/** Consume la marca: `true` si había un cambio local pendiente. */
export function consumeLocalAuthChange(): boolean {
  const pending = localAuthChangePending;
  localAuthChangePending = false;
  return pending;
}

/**
 * Bloqueo de pestaña a nivel de módulo (NO un servicio: evita ciclos de DI con
 * los repositorios/servicios que el guardia también toca). `SessionGuardService`
 * lo actualiza en `blocked`; las escrituras lo leen aquí antes de tocar Supabase.
 */
let sessionBlockedFlag: SessionBlockedState = null;

/** Actualiza el flag global de bloqueo desde el servicio (único escritor). */
export function setSessionBlockedFlag(state: SessionBlockedState): void {
  sessionBlockedFlag = state;
}

/** `true` si la pestaña está bloqueada por un cambio de sesión en otra pestaña. */
export function isSessionBlocked(): boolean {
  return sessionBlockedFlag !== null;
}

/** Lanza `SessionBlockedError` si la pestaña está bloqueada; no toca Supabase. */
export function throwIfSessionBlocked(): void {
  if (sessionBlockedFlag !== null) throw new SessionBlockedError();
}

/** Mensaje de los rechazos cuando la pestaña está bloqueada: no toca Supabase. */
export const SESSION_BLOCKED_MESSAGE =
  'La sesión cambió en otra pestaña. Pulsa «Ir al inicio de sesión» para continuar.';

/** Error con el que se rechazan persist()/saveBoard/feedback/eliminar cuenta al bloquearse. */
export class SessionBlockedError extends Error {
  constructor() {
    super(SESSION_BLOCKED_MESSAGE);
    this.name = 'SessionBlockedError';
  }
}

/**
 * Clasifica el cambio de sesión: la pestaña arrancó con `startUserId` y ahora la
 * sesión compartida es de `newUserId` (null = ya no hay sesión).
 *
 * - null → 'signed-out' (otra pestaña cerró sesión).
 * - distinto del inicial → 'other-account' (otra pestaña entró con otra cuenta).
 * - igual (incluido el refresco normal de token) → 'same'.
 */
export function classifySessionChange(
  startUserId: string | null,
  newUserId: string | null
): SessionChangeKind {
  if (newUserId === null) return 'signed-out';
  if (startUserId !== null && newUserId !== startUserId) return 'other-account';
  return 'same';
}

/** Claves de localStorage que puede tocar la sesión compartida de Supabase. */
const SUPABASE_AUTH_KEY_PATTERN = /^sb-.*-auth-token(-code-verifier)?$/;

/**
 * `true` si la clave de un evento `storage` puede contener la sesión compartida.
 * Se ignoran todas las demás (tableros locales, tema, PKCE por flujo, etc.).
 */
export function isSupabaseSessionKey(key: string | null): boolean {
  return typeof key === 'string' && SUPABASE_AUTH_KEY_PATTERN.test(key);
}

/**
 * Extrae el userId de un valor de localStorage de sesión (`sb-…-auth-token`).
 * Devuelve null si no hay valor (clave borrada = sesión cerrada) o si el valor está
 * corrupto o tiene forma inesperada. Nunca lanza: un JSON inválido no puede bloquear
 * ni desbloquear la pestaña.
 */
export function extractStoredUserId(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return null;
    const user = (parsed as { user?: unknown }).user;
    if (user === null || typeof user !== 'object') return null;
    const id = (user as { id?: unknown }).id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}
