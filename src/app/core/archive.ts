import {
  ARCHIVE_POLICY,
  countdownLabel,
  retentionDaysLeft,
  retentionUrgency
} from './list-retention';

/**
 * Archivo de listas terminadas: especialización de la lógica compartida de
 * `core/list-retention.ts` con el plazo del archivo (60 días) y los tramos de color
 * escalada a esa ventana.
 */

/** Días que una lista permanece archivada antes de eliminarse de forma permanente. */
export const ARCHIVE_RETENTION_DAYS = ARCHIVE_POLICY.retentionDays;

/** Nivel de urgencia del archivo; reutiliza el de la lógica compartida. */
export type ArchiveUrgency = ReturnType<typeof retentionUrgency>;

/**
 * Días que faltan para el borrado definitivo del archivo. Se redondea hacia arriba para
 * que "1 día" cubra las últimas 24 horas completas, y 0 (o menos) significa vencida.
 */
export function archiveDaysLeft(archivedAt: string, now: Date = new Date()): number {
  return retentionDaysLeft(archivedAt, ARCHIVE_POLICY, now);
}

/**
 * Urgencia según lo cerca que esté el borrado. En el archivo el tramo rojo son los
 * 3 últimos días, no solo el último, para que se note con antelación.
 */
export function archiveUrgency(days: number): ArchiveUrgency {
  return retentionUrgency(days, ARCHIVE_POLICY);
}

export { countdownLabel };

// La purga del archivo es la misma función compartida del basurero, con el plazo de 60 días
// y sobre `archivedLists`. Se reexporta para que la página del archivo use el mismo patrón.
export { purgeExpiredArchivedLists, archiveList } from './list-retention';