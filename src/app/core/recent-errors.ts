import {
  FeedbackRecentError,
  RECENT_ERRORS_LIMIT,
  RECENT_ERROR_TEXT_LIMIT,
  scrubSensitiveText
} from './feedback/feedback-core/feedback-core';

/**
 * ERRORES RECIENTES
 *
 * Buffer circular con los últimos RECENT_ERRORS_LIMIT errores y promesas rechazadas sin
 * capturar. Se registra UNA vez desde el arranque (`installRecentErrors`, en main.ts), no al
 * abrir el modal: así el buffer recoge fallos que ocurrieron antes de que el usuario decidiera
 * escribirnos, que es justo cuando más información aporta.
 *
 * Es un módulo sin dependencias de Angular a propósito: tiene que poder instalarse antes de
 * `bootstrapApplication`, cuando todavía no hay injector.
 *
 * PRIVACIDAD: cada texto pasa por `scrubSensitiveText`, que quita URLs con parámetros, correos
 * y tokens, y lo recorta. Un error puede traer cualquiera de esas tres cosas en su mensaje o
 * en el stack, y este buffer acaba dentro de un correo.
 *
 * LIMITACIÓN CONOCIDA: no hay forma de saber que un error se va a producir. Esto recoge los que
 * ya han ocurrido, así que es una foto del pasado reciente, no un registro anticipado de la
 * causa. Para los errores de Angular que se gestionan sin llegar a `window.onerror` (muchos
 * logged por consola) el buffer se queda corto; por eso `console.error` no se intercepta.
 */
const buffer: FeedbackRecentError[] = [];
let instalado = false;

function push(mensaje: string): void {
  buffer.push({ message: mensaje, at: new Date().toISOString() });
  // Buffer circular: al superar el tope sale el más antiguo por el principio.
  while (buffer.length > RECENT_ERRORS_LIMIT) buffer.shift();
}

function onError(event: ErrorEvent): void {
  // Se registra el mensaje y las primeras líneas del stack, ya limpios y recortados.
  const partes = [String(event.message ?? 'Error')];
  const stack = event.error instanceof Error ? event.error.stack : '';
  if (stack) partes.push(`\n${stack.split('\n').slice(0, 3).join('\n')}`);
  push(scrubSensitiveText(partes.join('')));
}

function onRejection(event: PromiseRejectionEvent): void {
  const reason: unknown = event.reason;
  const mensaje = reason instanceof Error
    ? `${reason.name}: ${reason.message}`
    : String(reason ?? 'Promesa rechazada');
  const stack = reason instanceof Error && reason.stack
    ? `\n${reason.stack.split('\n').slice(0, 3).join('\n')}`
    : '';
  push(scrubSensitiveText(`${mensaje}${stack}`));
}

/**
 * Registra los listeners una sola vez. Llamarlo de más no duplica nada, así que es seguro
 * invocarlo desde varios sitios (o en caliente, durante el desarrollo).
 */
export function installRecentErrors(): void {
  if (instalado || typeof window === 'undefined') return;
  instalado = true;
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
}

/** Copia del buffer, del más reciente al más antiguo. Nunca la referencia interna. */
export function snapshotRecentErrors(): readonly FeedbackRecentError[] {
  return [...buffer].reverse();
}

/** Vacía el buffer. Se usa tras un envío correcto, para no arrastrar errores ya reportados. */
export function clearRecentErrors(): void {
  buffer.length = 0;
}