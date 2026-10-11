/**
 * Mensajes de error del envío de comentarios.
 *
 * Traduce el fallo de la Edge Function a un texto en español. Vive aparte de
 * `feedback-core.ts` porque ese fichero tiene una copia en `supabase/functions/` que se
 * compara byte a byte en las pruebas, y esto es solo del cliente.
 */

/** Error con la misma forma que devuelve supabase-js en `functions.invoke`. */
export interface ErrorDeEnvio {
  status?: number;
  message?: string;
}

/** Respuesta de la Edge Function cuando no trae error de transporte. */
export interface RespuestaDeEnvio {
  ok?: boolean;
  error?: string;
}

/**
 * Traduce el fallo a un mensaje en español según el código.
 *
 * Para 400/413/429 el servidor ya devuelve un texto pensado para el usuario y se respeta;
 * el resto son fallos de red o de servidor que no explican nada útil, así que se
 * sustituyen por uno propio.
 */
export function mensajeParaError(error: ErrorDeEnvio | null | undefined): string {
  const status = error?.status ?? 0;
  if (status === 0) return 'No se pudo enviar el reporte. Revisa la conexión e inténtalo de nuevo.';
  if (status === 401) return 'Inicia sesión para enviar comentarios.';
  if (status === 429) return 'Has enviado demasiados comentarios. Inténtalo más tarde.';
  if (status === 413) return 'Las imágenes son demasiado grandes. Adjunta menos o más pequeñas.';
  if (status >= 500) return 'El servidor no ha podido guardar el reporte. Inténtalo en un momento.';
  if (status >= 400 && error?.message) return error.message;
  return 'No se pudo enviar el reporte. Inténtalo de nuevo.';
}

/** Cualquier excepción (sin red, CORS, abortado) siempre es transitoria. */
export function mensajeErrorDeEnvio(): string {
  return 'No se pudo enviar el reporte. Revisa la conexión e inténtalo de nuevo.';
}

/**
 * Texto cuando la función responde sin error pero tampoco con éxito. El servidor manda su
 * propio mensaje cuando lo tiene; si no, uno genérico.
 */
export function mensajeRespuestaNoOk(respuesta: RespuestaDeEnvio | null | undefined): string {
  return respuesta?.error ?? 'No se pudo enviar el reporte. Inténtalo de nuevo.';
}

/** ¿La respuesta de la función es un éxito? */
export function esEnvioCorrecto(respuesta: RespuestaDeEnvio | null | undefined): boolean {
  return respuesta?.ok === true;
}

/** Aviso cuando se intenta enviar sin conexión. */
export function mensajeSinConexion(): string {
  return 'Sin conexión: no se puede enviar ahora.';
}

/** Aviso cuando la pestaña está bloqueada por otra pestaña. */
export function mensajePestanaBloqueada(mensaje: string): string {
  return mensaje;
}

/** El envío no está disponible en esta instalación (sin credenciales o sin sesión). */
export function mensajeEnvioNoDisponible(): string {
  return 'El envío de comentarios no está disponible en esta instalación.';
}

/** Falta sesión para poder enviar. */
export function mensajeSinSesion(): string {
  return 'Inicia sesión para enviar comentarios.';
}
