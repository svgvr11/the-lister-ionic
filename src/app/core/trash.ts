import { ChecklistBoard } from '../models/board.models';

/** Días que una lista permanece en el basurero antes de eliminarse de forma permanente. */
export const TRASH_RETENTION_DAYS = 7;

const MS_PER_DAY = 86_400_000;

/** Niveles de urgencia de la cuenta atrás: el color escala a medida que se acerca el borrado. */
export type TrashUrgency = 'normal' | 'warning' | 'danger';

/** Fecha en la que la lista se elimina definitivamente del basurero. */
export function purgeDate(deletedAt: string): Date {
  return new Date(new Date(deletedAt).getTime() + TRASH_RETENTION_DAYS * MS_PER_DAY);
}

/**
 * Días que faltan para el borrado definitivo. Se redondea hacia arriba para que
 * "1 día" cubra las últimas 24 horas completas, y 0 (o menos) significa vencida.
 */
export function daysLeft(deletedAt: string, now: Date = new Date()): number {
  return Math.ceil((purgeDate(deletedAt).getTime() - now.getTime()) / MS_PER_DAY);
}

/**
 * Urgencia según lo cerca que esté el borrado. Con el último día la lista
 * además se tiñe de rojo, por eso ese nivel es aparte.
 */
export function trashUrgency(days: number): TrashUrgency {
  if (days <= 1) return 'danger';
  if (days <= 3) return 'warning';
  return 'normal';
}

/** Etiqueta de la cuenta atrás que se muestra en el badge de cada lista descartada. */
export function countdownLabel(days: number): string {
  if (days <= 1) return `${Math.max(days, 1)} día (Último día)`;
  return `${days} días`;
}

/**
 * Normaliza el basurero de un tablero y descarta lo que ya cumplió los 7 días.
 * Devuelve también si se eliminó alguna lista, para avisar que hay que guardar.
 */
export function purgeExpiredLists(board: ChecklistBoard, now: Date = new Date()): boolean {
  const trashed = board.trashedLists ?? [];
  const alive = trashed.filter((entry) => daysLeft(entry.deletedAt, now) > 0);
  const purged = alive.length !== trashed.length;
  board.trashedLists = alive;
  return purged;
}