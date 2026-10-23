import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_RETENTION_DAYS,
  archiveDaysLeft,
  archiveUrgency,
  purgeExpiredArchivedLists
} from './archive';
import type { ChecklistBoard } from '../models/board.model';

/**
 * Pruebas de los envoltorios del archivo. `core/archive.ts` fija el plazo de 60 días y
 * reexporta la lógica compartida de `core/list-retention.ts`.
 */

const NOW = new Date('2026-06-01T12:00:00.000Z');
const MS_PER_DAY = 86_400_000;
const daysAgo = (days: number): string => new Date(NOW.getTime() - days * MS_PER_DAY).toISOString();

const board = (archivedAt: string): ChecklistBoard => ({
  id: 'board-1',
  title: 'Board',
  createdAt: '2026-01-01T00:00:00.000Z',
  lists: [],
  archivedLists: [{ list: lista(), archivedAt }]
});

const lista = () => ({
  id: 'l1',
  boardId: 'board-1',
  title: 'Lista',
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  tasks: []
});

describe('archive: plazo del archivo', () => {
  it('el plazo del archivo son 60 días', () => {
    expect(ARCHIVE_RETENTION_DAYS).toBe(60);
  });

  it('los días restantes bajan de 60 a 1', () => {
    expect(archiveDaysLeft(daysAgo(0), NOW)).toBe(60);
    expect(archiveDaysLeft(daysAgo(1), NOW)).toBe(59);
    expect(archiveDaysLeft(daysAgo(59), NOW)).toBe(1);
  });

  it('la urgencia escalada a 60 días: rojo en los 3 últimos', () => {
    expect(archiveUrgency(60)).toBe('normal');
    expect(archiveUrgency(16)).toBe('normal');
    expect(archiveUrgency(15)).toBe('warning');
    expect(archiveUrgency(4)).toBe('warning');
    expect(archiveUrgency(3)).toBe('danger');
    expect(archiveUrgency(1)).toBe('danger');
  });
});

describe('archive: purga reexportada', () => {
  it('conserva la lista a los 59 días y la elimina a los 60', () => {
    const viva = board(daysAgo(59));
    expect(purgeExpiredArchivedLists(viva, NOW)).toBe(false);
    expect(viva.archivedLists?.length).toBe(1);

    const vencida = board(daysAgo(60));
    expect(purgeExpiredArchivedLists(vencida, NOW)).toBe(true);
    expect(vencida.archivedLists).toEqual([]);
  });

  it('un tablero que nunca tuvo archivo no gana el campo por abrirlo', () => {
    const antiguo: ChecklistBoard = {
      id: 'board-1',
      title: 'Board',
      createdAt: '2026-01-01T00:00:00.000Z',
      lists: []
    };
    expect(purgeExpiredArchivedLists(antiguo, NOW)).toBe(false);
    expect(antiguo.archivedLists).toBeUndefined();
  });
});
