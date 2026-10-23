/**
 * Máquina de estados del modal de comentarios.
 *
 * El modal mezclaba la lógica de "¿puedo enviar?", "¿puedo cerrar?" y "¿qué se limpia al
 * cerrar?" con el manejo del foco y de las imágenes. Aquí están esas decisiones, como
 * funciones puras sobre un estado, para poder probarlas sin montar el componente.
 *
 * El estado no se guarda en ningún sitio: quien llama (el componente) lo mantiene y aplica
 * el resultado. Esto es a propósito, para que la máquina no tenga efectos secundarios.
 */

/** Estado del modal que las decisiones necesitan. */
export interface EstadoModal {
  /** El envío se completó: la vista es la de confirmación. */
  enviado: boolean;
  /** Hay un envío en curso: los botones quedan deshabilitados. */
  ocupado: boolean;
  /** El diálogo "¿descartar lo escrito?" está abierto. */
  confirmandoDescarte: boolean;
  /** Hay texto escrito o imágenes adjuntas: cerrar podría perder trabajo. */
  tieneContenido: boolean;
}

/** Qué hay que hacer cuando el usuario intenta cerrar el modal. */
export type DecisionDeCierre =
  /** No se puede cerrar ahora: hay un envío en curso o ya se está preguntando. */
  | 'nada'
  /** Hay contenido que perder: hay que preguntar antes. */
  | 'preguntar'
  /** Se cierra sin más. */
  | 'cerrar';

/**
 * Escape y el clic en el fondo son cierres ACCIDENTALES: si hay algo escrito, no cierran
 * de golpe sino que preguntan. La X y "Cancelar" son INTENCIONALES y cierran directo.
 *
 * Con un envío en curso nunca se cierra (evita dejar una petición a medias), y si ya se
 * está preguntando, un segundo Escape no vuelve a preguntar.
 */
export function decidirCierre(estado: EstadoModal): DecisionDeCierre {
  if (estado.ocupado || estado.confirmandoDescarte) return 'nada';
  if (estado.tieneContenido && !estado.enviado) return 'preguntar';
  return 'cerrar';
}

/** Qué se limpia al cerrar de verdad. */
export interface LimpiezaAlCerrar {
  /** Borrar el borrador guardado en el servicio. */
  borrarBorrador: boolean;
  /** Vaciar el formulario y soltar las imágenes. */
  resetearFormulario: boolean;
}

/**
 * Al cerrar solo se vacía todo si el envío se completó. Un fallo de red deja el texto y
 * las imágenes intactos para poder reintentar.
 */
export function limpiezaAlCerrar(estado: Pick<EstadoModal, 'enviado'>): LimpiezaAlCerrar {
  if (!estado.enviado) return { borrarBorrador: false, resetearFormulario: false };
  return { borrarBorrador: true, resetearFormulario: true };
}

/** Qué hace el botón "Descartar" del diálogo de confirmación. */
export function decidirDescarte(): {
  soltarImagenes: boolean;
  resetearFormulario: boolean;
  borrarBorrador: boolean;
} {
  return { soltarImagenes: true, resetearFormulario: true, borrarBorrador: true };
}

/** Resultado de un envío. */
export type ResultadoEnvio = { ok: true } | { ok: false; message: string };

/** Qué cambia en el modal tras intentar enviar. */
export type EstadoTrasEnviar =
  /** Envío correcto: se pasa a la vista de confirmación. */
  | { tipo: 'enviado' }
  /** Fallo: se muestra el mensaje y se conserva todo para reintentar. */
  | { tipo: 'error'; mensaje: string };

/** Aplica el resultado de un envío al estado. */
export function estadoTrasEnviar(resultado: ResultadoEnvio): EstadoTrasEnviar {
  return resultado.ok ? { tipo: 'enviado' } : { tipo: 'error', mensaje: resultado.message };
}

/** ¿El botón de enviar debe estar habilitado? */
export function puedeEnviar(estado: {
  ocupado: boolean;
  enviado: boolean;
  enLinea: boolean;
  valido: boolean;
}): boolean {
  return !estado.ocupado && !estado.enviado && estado.enLinea && estado.valido;
}

/** El mensaje que se muestra cuando se pulsa enviar sin conexión. */
export function avisoSinConexion(enLinea: boolean): string {
  return enLinea ? '' : 'Sin conexión: no se puede enviar ahora.';
}

/** ¿Hay algo escrito que perder? */
export function tieneContenido(mensaje: string, imagenes: number): boolean {
  return mensaje.trim().length > 0 || imagenes > 0;
}

/** El mensaje es demasiado corto pero no está vacío (aviso progresivo). */
export function mensajeDemasiadoCorto(mensaje: string, minimo: number): boolean {
  const largo = mensaje.trim().length;
  return largo > 0 && largo < minimo;
}
