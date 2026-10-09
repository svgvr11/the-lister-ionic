/**
 * Lógica pura del spinner de login (sin Angular).
 * Constantes y funciones de tiempo para el overlay de "Iniciando sesión…".
 */

export const LOGIN_SPINNER_MIN_MS = 3000;
export const LOGIN_SPINNER_MAX_MS = 20000;

/**
 * Milisegundos que faltan para cumplir el mínimo de 3 s.
 * Devuelve 0 si ya pasó el mínimo o si startedAt es futuro (caso borde).
 */
export function remainingMinMs(startedAt: number, now: number): number {
  const elapsed = now - startedAt;
  if (elapsed <= 0) return LOGIN_SPINNER_MIN_MS;
  return Math.max(0, LOGIN_SPINNER_MIN_MS - elapsed);
}

/**
 * Indica si se alcanzó el tiempo máximo de seguridad (20 s).
 */
export function shouldForceStop(startedAt: number, now: number): boolean {
  return (now - startedAt) >= LOGIN_SPINNER_MAX_MS;
}