import {
  countdownLabel,
  retentionDaysLeft,
  retentionDeadline,
  retentionUrgency,
  TRASH_POLICY
} from '../list-retention/list-retention';

/**
 * Días que una lista permanece en el basurero antes de eliminarse de forma permanente.
 *
 * Toda la lógica compartida con el archivo (cuenta atrás, urgencia y purga) vive en
 * `core/list-retention.ts`, parametrizada por la política de cada colección. Aquí solo
 * se declara el plazo del basurero y se exponen sus funciones, que usan estas páginas.
 */

/** Días que una lista permanece en el basurero antes de eliminarse de forma permanente. */
export const TRASH_RETENTION_DAYS = TRASH_POLICY.retentionDays;

/** Nivel de urgencia del basurero; reutiliza el de la lógica compartida. */
export type TrashUrgency = ReturnType<typeof retentionUrgency>;

/** Fecha en la que la lista se elimina definitivamente del basurero. */
export function purgeDate(deletedAt: string): Date {
  return retentionDeadline(deletedAt, TRASH_POLICY);
}

/**
 * Días que faltan para el borrado definitivo. Se redondea hacia arriba para que
 * "1 día" cubra las últimas 24 horas completas, y 0 (o menos) significa vencida.
 */
export function daysLeft(deletedAt: string, now: Date = new Date()): number {
  return retentionDaysLeft(deletedAt, TRASH_POLICY, now);
}

/**
 * Urgencia según lo cerca que esté el borrado. Con el último día la lista
 * además se tiñe de rojo, por eso ese nivel es aparte.
 */
export function trashUrgency(days: number): TrashUrgency {
  return retentionUrgency(days, TRASH_POLICY);
}

export { countdownLabel };

// La purga vive en el módulo compartido: es la misma función con otro plazo y sobre otra
// colección. Se reexporta aquí para que estas páginas sigan importando el basurero de un solo sitio.
export { purgeExpiredLists } from '../list-retention/list-retention';