import { mergeBoardAdditions } from './board-merge';
import type { ChecklistBoard } from '../models/board.models';
import type { BoardConflict } from './services/board.repository';

/**
 * Árbitro de conflictos del tablero.
 *
 * Decide qué hacer cuando llega un tablero remoto (¿es un eco propio? ¿se aplica o se
 * espera?) y qué hacer cuando hay un remoto esperando en el momento de guardar (¿se
 * adopta? ¿se fusiona? ¿es un conflicto?). Estaba dentro de `BoardPage`.
 *
 * Nada de Angular ni de DOM: todas las funciones reciben datos y devuelven una decisión.
 * No mutan nada, así que la página es quien aplica el resultado (y quien limpia su
 * estado). El reloj y los identificadores no hacen falta aquí.
 */

/** Qué hacer con un tablero que llega de la nube. */
export type DecisionEntrante =
  /** Es el eco de un guardado propio: se descarta en silencio. */
  | 'ignore'
  /** El usuario está interactuando (o ya hay un conflicto): se guarda como pendiente. */
  | 'defer'
  /** Vía libre: se aplica. */
  | 'apply';

/** Estado necesario para decidir sobre un tablero entrante. */
export interface EstadoEntrante {
  /** El tablero que llega es el eco de algo que guardó esta pestaña. */
  esEcoPropio: boolean;
  /** Hay una edición, un arrastre, un modal o un guardado en curso. */
  interaccionActiva: boolean;
  /** Ya hay un conflicto sin resolver. */
  hayConflicto: boolean;
}

/**
 * Decide qué hacer con un tablero que llega de la nube.
 *
 * El orden importa: el eco propio se descarta siempre (aunque haya interacción), y con
 * interacción o conflicto activo el tablero se aparta para no pisarle al usuario lo que
 * está haciendo.
 */
export function decideIncomingBoard(estado: EstadoEntrante): DecisionEntrante {
  if (estado.esEcoPropio) return 'ignore';
  if (estado.interaccionActiva || estado.hayConflicto) return 'defer';
  return 'apply';
}

/** Qué hacer justo antes de guardar, cuando hay un tablero remoto esperando. */
export type DecisionPendiente =
  /** No hay nada pendiente: se guarda el tablero tal cual. */
  | { tipo: 'save' }
  /** El local no tenía cambios: se adopta el remoto y NO se guarda (ya está al día). */
  | { tipo: 'adopt'; board: ChecklistBoard }
  /** Había cambios en los dos sitios y se han podido fusionar: se guarda la fusión. */
  | { tipo: 'merge'; board: ChecklistBoard }
  /** No se pueden fusionar: se abre el conflicto y no se guarda. */
  | { tipo: 'conflicto'; razon: string; board: ChecklistBoard };

/** Estado necesario para decidir antes de guardar. */
export interface EstadoAntesDeGuardar {
  /** Tablero que se quiere guardar (el de la pantalla). */
  local: ChecklistBoard;
  /** Último tablero que se aplicó desde la nube, o null si aún no llegó ninguno. */
  ultimoAplicado: ChecklistBoard | null;
  /** Tablero remoto que llegó mientras se interactuaba, o null si no hay. */
  pendienteRemoto: ChecklistBoard | null;
}

/**
 * Decide qué hacer con el tablero remoto pendiente antes de guardar.
 *
 * Si el tablero de la pantalla sigue siendo el último que se aplicó, el usuario no ha
 * cambiado nada: se adopta el remoto y no hace falta guardar. Si cambió algo, se intenta
 * fusionar solo adiciones; si la fusión no es posible, es un conflicto.
 */
export function decidePendingBeforeSave(estado: EstadoAntesDeGuardar): DecisionPendiente {
  if (!estado.pendienteRemoto) return { tipo: 'save' };

  if (estado.ultimoAplicado && boardsEqual(estado.local, estado.ultimoAplicado)) {
    return { tipo: 'adopt', board: estado.pendienteRemoto };
  }

  try {
    const merged = mergeBoardAdditions(
      estado.ultimoAplicado ?? estado.local,
      estado.local,
      estado.pendienteRemoto
    );
    return { tipo: 'merge', board: merged };
  } catch (error) {
    return { tipo: 'conflicto', razon: razonConflictoPorError(error), board: estado.pendienteRemoto };
  }
}

/** Qué hacer con el tablero remoto pendiente justo después de guardar. */
export type DecisionTrasGuardar =
  /** No hay nada que hacer: no hay pendiente, o sigue habiendo interacción o conflicto. */
  | { tipo: 'nada' }
  /** Se puede aplicar el tablero remoto que estaba esperando. */
  | { tipo: 'aplicar'; board: ChecklistBoard }
  /** El guardado falló y el tablero local había cambiado: es un conflicto local. */
  | { tipo: 'conflicto'; razon: string; board: ChecklistBoard };

/** Estado necesario para decidir después de guardar. */
export interface EstadoTrasGuardar {
  local: ChecklistBoard;
  ultimoAplicado: ChecklistBoard | null;
  pendienteRemoto: ChecklistBoard | null;
  /** ¿Ha llegado a guardarse el tablero local? */
  guardadoOk: boolean;
  interaccionActiva: boolean;
  hayConflicto: boolean;
}

/**
 * Decide qué hacer con el remoto pendiente después de un guardado.
 *
 * Solo se suelta cuando el usuario ya no está interactuando y no hay conflicto abierto.
 * Y si el guardado FALLÓ con el tablero modificado, no se aplica el remoto: sería perder
 * el trabajo local, así que se convierte en un conflicto para que el usuario elija.
 */
export function decidePendingAfterSave(estado: EstadoTrasGuardar): DecisionTrasGuardar {
  if (!estado.pendienteRemoto || estado.interaccionActiva || estado.hayConflicto) {
    return { tipo: 'nada' };
  }
  if (
    !estado.guardadoOk &&
    estado.ultimoAplicado &&
    !boardsEqual(estado.local, estado.ultimoAplicado)
  ) {
    return { tipo: 'conflicto', razon: RAZON_CONFLICTO_LOCAL, board: estado.pendienteRemoto };
  }
  return { tipo: 'aplicar', board: estado.pendienteRemoto };
}

/** Texto del conflicto cuando llegan cambios de otro dispositivo mientras se editaba. */
export const RAZON_CONFLICTO_LOCAL =
  'Llegaron cambios desde otro dispositivo mientras editabas. Elige qué versión conservar.';

/**
 * Texto del conflicto cuando la fusión de adiciones no es posible.
 *
 * Se conserva el comportamiento actual: si el error trae mensaje se incluye (para poder
 * diagnosticar) y si no, se usa el texto genérico.
 */
export function razonConflictoPorError(error: unknown): string {
  return error instanceof Error
    ? `No se pueden combinar estos cambios: ${error.message}`
    : RAZON_CONFLICTO_LOCAL;
}

/**
 * ¿Dos tableros son el mismo? Compara el JSON tal cual, así que **sí depende del orden de
 * las claves** (ver BUG-07 en las pruebas). Se mantiene a propósito: es lo que hacía la
 * página y cambiarlo alteraría cuándo se considera que el local "no ha cambiado".
 */
export function boardsEqual(left: ChecklistBoard, right: ChecklistBoard): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Estado de la doble confirmación para resolver un conflicto. */
export interface EstadoResolucion {
  resolution: 'remote' | 'local';
  /** La página ya pedió la segunda confirmación. */
  confirmandoLocal: boolean;
}

/**
 * Resolver con 'local' pide una confirmación aparte: sobrescribe el tablero remoto, así
 * que la primera pulsación solo marca la confirmación y la segunda resuelve.
 */
export function pideDobleConfirmacion(estado: EstadoResolucion): boolean {
  return estado.resolution === 'local' && !estado.confirmandoLocal;
}

/**
 * Tablero remoto que se aplica al resolver un conflicto con 'remote'.
 *
 * Si mientras tanto llegó otro tablero más reciente, ese manda; si no, el que traía el
 * conflicto. Es exactamente el `pendiente ?? remoto` de la página.
 */
export function tableroRemotoParaResolver(
  conflicto: BoardConflict,
  pendienteRemoto: ChecklistBoard | null
): ChecklistBoard {
  return pendienteRemoto ?? conflicto.remoteBoard;
}
