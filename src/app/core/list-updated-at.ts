import type { ChecklistList } from '../models/board.model';

/**
 * Fecha de la última modificación de una lista («Última actualización» del modal de enfoque).
 *
 * Todo aquí es puro: ni Angular, ni DOM, ni red. Las piezas son las que hacen falta para que el
 * tablero sepa cuándo se tocó una lista por última vez (`touchList`), para que una lista guardada
 * antes de esta función siga teniendo algo que mostrar (`resolveListUpdatedAt`) y para que esa
 * fecha se escriba en pantalla con el formato fijo del requisito (`formatLastUpdated`) con su
 * tooltip de zona horaria (`describeDeviceTimeZone`).
 *
 * LAS ZONAS HORARIAS: en producción NUNCA se fija una. Las dos funciones de formato, si no
 * reciben `timeZone`, usan la del dispositivo (`Intl.DateTimeFormat().resolvedOptions()
 * .timeZone`). Las zonas fijas son solo para los tests (ver AGENTS.md).
 */

/** Zona horaria del dispositivo: la que se usa siempre que no se pasa ninguna. */
function zonaDelDispositivo(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Formateadores cacheados: la etiqueta y el tooltip se recalculan en cada pintado del modal. */
const formateadores = new Map<string, Intl.DateTimeFormat>();

/**
 * Construye (y recuerda) un formateador. Si la zona no se puede resolver —texto inventado o zona
 * que el motor no conoce— `Intl.DateTimeFormat` lanza `RangeError`, así que se reintenta sin
 * zona en lugar de romper: cae en la del dispositivo.
 */
function obtenerFormateador(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const clave = JSON.stringify([locale, options]);
  const guardado = formateadores.get(clave);
  if (guardado) return guardado;
  let formateador: Intl.DateTimeFormat;
  try {
    formateador = new Intl.DateTimeFormat(locale, options);
  } catch {
    const { timeZone: _zona, ...sinZona } = options;
    formateador = new Intl.DateTimeFormat(locale, sinZona);
  }
  formateadores.set(clave, formateador);
  return formateador;
}

/** Formatea una fecha con la zona indicada (o la del dispositivo si no se pasa ninguna). */
function formatear(
  locale: string,
  options: Intl.DateTimeFormatOptions,
  fecha: Date,
  timeZone?: string
): string {
  return obtenerFormateador(locale, { ...options, timeZone: timeZone ?? zonaDelDispositivo() }).format(fecha);
}

/** Opciones de formato. `timeZone` solo se pasa en los tests; en producción va sin zona. */
export interface FormatoFechaOpciones {
  locale?: string;
  timeZone?: string;
}

/** ¿Es una fecha legible? Una cadena vacía, texto suelto o un número no lo son. */
function esFechaValida(valor: unknown): valor is string {
  return typeof valor === 'string' && Number.isFinite(Date.parse(valor));
}

/**
 * Fija la fecha de la última modificación de la lista. Devuelve `false` (y no escribe nada) si la
 * fecha que se le da no es legible, para que un reloj roto no deje la lista con una fecha inútil.
 */
export function touchList(list: ChecklistList, ahora: string = new Date().toISOString()): boolean {
  if (!esFechaValida(ahora)) return false;
  if (list.updatedAt === ahora) return false;
  list.updatedAt = ahora;
  return true;
}

/** La fecha más reciente entre las candidatas, tal cual venía guardada (sin normalizar). */
function fechaMasReciente(valores: (string | undefined)[]): string | null {
  let mejor: string | null = null;
  let mejorInstante = Number.NEGATIVE_INFINITY;
  for (const valor of valores) {
    if (!esFechaValida(valor)) continue;
    const instante = Date.parse(valor);
    if (instante <= mejorInstante) continue;
    mejor = valor;
    mejorInstante = instante;
  }
  return mejor;
}

/**
 * Fecha que se muestra para una lista: su `updatedAt` si lo tiene, y si no (tableros guardados
 * antes de esta función) el `createdAt` más reciente entre la lista y sus tareas. Devuelve `null`
 * cuando no hay ninguna fecha legible: en ese caso la etiqueta no se pinta.
 */
export function resolveListUpdatedAt(list: ChecklistList): string | null {
  if (esFechaValida(list.updatedAt)) return list.updatedAt;
  const tareas = Array.isArray(list.tasks) ? list.tasks : [];
  return fechaMasReciente([list.createdAt, ...tareas.map((tarea) => tarea.createdAt)]);
}

/**
 * Etiqueta completa de la fila inferior del modal:
 * `Última actualización: 2 de noviembre de 2025, 19:31`.
 *
 * Se construye con DOS formateadores —fecha larga y hora de 24 h— unidos con «, », en vez de
 * dejar que el motor ICU junte fecha y hora, para que el resultado no dependa de cómo los pega.
 * Día sin cero inicial y mes completo en minúscula salen de `es-CL` con `numeric`/`long`.
 * Fecha inválida o ausencia de ella: cadena vacía.
 */
export function formatLastUpdated(
  iso: string | null | undefined,
  opciones: FormatoFechaOpciones = {}
): string {
  if (!esFechaValida(iso)) return '';
  const fecha = new Date(iso);
  const locale = opciones.locale ?? 'es-CL';
  const fechaLarga = formatear(
    locale,
    { day: 'numeric', month: 'long', year: 'numeric' },
    fecha,
    opciones.timeZone
  );
  const hora = formatear(
    locale,
    { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
    fecha,
    opciones.timeZone
  );
  return `Última actualización: ${fechaLarga}, ${hora}`;
}

/** Texto del tooltip cuando no hay zona que nombrar. */
const TOOLTIP_SIN_ZONA = 'Zona horaria del dispositivo';

/** Prefijo de la etiqueta, separado por si hace falta partirlo en dos líneas. */
export const LAST_UPDATED_PREFIX = 'Última actualización:';

/**
 * Parte la etiqueta en sus dos líneas: el texto fijo y la fecha con la hora.
 *
 * En pantallas estrechas la etiqueta entra al lado del botón «Listo» partida en dos renglones
 * en lugar de caer a su propia fila, que es lo que ocurría cuando se dejaba que el navegador
 * rompiera el texto por donde quisiera.
 */
export function splitLastUpdated(texto: string): { etiqueta: string; fecha: string } {
  if (!texto) return { etiqueta: '', fecha: '' };
  if (!texto.startsWith(LAST_UPDATED_PREFIX)) return { etiqueta: texto, fecha: '' };
  return {
    etiqueta: LAST_UPDATED_PREFIX,
    fecha: texto.slice(LAST_UPDATED_PREFIX.length).trim()
  };
}

/** Parte de un `formatToParts` buscando por tipo. */
function parte(formateador: Intl.DateTimeFormat, fecha: Date, tipo: string): string | undefined {
  if (typeof formateador.formatToParts !== 'function') return undefined;
  return formateador.formatToParts(fecha).find((part) => part.type === tipo)?.value;
}

/** ¿El motor resuelve esta zona? Si no, se usa la del dispositivo, que siempre resuelve. */
function zonaResoluble(locale: string, timeZone: string): string {
  try {
    new Intl.DateTimeFormat(locale, { timeZone });
    return timeZone;
  } catch {
    return zonaDelDispositivo();
  }
}

/**
 * Texto del tooltip de la etiqueta: `Zona horaria del dispositivo: America/Santiago (GMT-03:00)`.
 *
 * El desfase es el del instante de `updatedAt` —el mismo con el que se pinta la hora—, así que se
 * saca de `formatToParts` con `timeZoneName: 'longOffset'`. Si el motor no conoce `longOffset` (o
 * devuelve otra cosa que no es un desfase), el tooltip se queda con el identificador a secas; y si
 * encima la zona no se puede resolver, con el texto pelado. En ningún caso lanza. Fecha inválida o
 * ausente: cadena vacía.
 */
export function describeDeviceTimeZone(
  iso: string | null | undefined,
  opciones: FormatoFechaOpciones = {}
): string {
  if (!esFechaValida(iso)) return '';
  const locale = opciones.locale ?? 'es-CL';
  const zona = zonaResoluble(locale, opciones.timeZone ?? zonaDelDispositivo());
  const fecha = new Date(iso);

  const desfase = parte(
    obtenerFormateador(locale, { timeZone: zona, timeZoneName: 'longOffset' }),
    fecha,
    'timeZoneName'
  );
  // Un motor sin `longOffset` devuelve el nombre genérico de la zona (o «GMT» a secas en el
  // caso de UTC): si no trae GMT ni un signo, no es un desfase con horas y no se inventa.
  const conDesfase = desfase && /gmt|[+-]/i.test(desfase) ? ` (${desfase})` : '';
  return `${TOOLTIP_SIN_ZONA}: ${zona}${conDesfase}`;
}
