import { describe, expect, it } from 'vitest';
import {
  TRASH_RETENTION_DAYS,
  countdownLabel,
  daysLeft,
  purgeDate,
  purgeExpiredLists,
  trashUrgency
} from './trash';
import type { ChecklistBoard } from '../models/board.models';

/**
 * Pruebas de los envoltorios del basurero. `core/trash.ts` no calcula nada: fija el plazo
 * de 7 días y reexporta la lógica compartida de `core/list-retention.ts`. Estas pruebas
 * comprueban que esa especialización está bien conectada y que un solo sitio manda.
 */

const NOW = new Date('2026-06-01T12:00:00.000Z');
const MS_PER_DAY = 86_400_000;
const daysAgo = (days: number): string => new Date(NOW.getTime() - days * MS_PER_DAY).toISOString();

const board = (deletedAt: string): ChecklistBoard => ({
  id: 'board-1',
  title: 'Board',
  createdAt: '2026-01-01T00:00:00.000Z',
  lists: [],
  trashedLists: [{ list: lista(), deletedAt }]
});

const lista = () => ({
  id: 'l1',
  boardId: 'board-1',
  title: 'Lista',
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  tasks: []
});

describe('trash: plazo del basurero', () => {
  it('el plazo del basurero son 7 días', () => {
    expect(TRASH_RETENTION_DAYS).toBe(7);
  });

  it('purgeDate cae 7 días después de descartar la lista', () => {
    const deletedAt = '2026-06-01T12:00:00.000Z';
    const deadline = purgeDate(deletedAt);
    expect(deadline.getTime() - Date.parse(deletedAt)).toBe(7 * MS_PER_DAY);
  });
});

describe('trash: cuenta atrás', () => {
  it('los días restantes bajan de 7 a 1', () => {
    expect(daysLeft(daysAgo(0), NOW)).toBe(7);
    expect(daysLeft(daysAgo(1), NOW)).toBe(6);
    expect(daysLeft(daysAgo(6), NOW)).toBe(1);
    // Los parciales se redondean hacia arriba: medio día sigue siendo el día completo.
    expect(daysLeft(daysAgo(0.5), NOW)).toBe(7);
  });

  it('la urgencia escalada a 7 días: gris, ámbar y rojo', () => {
    expect(trashUrgency(7)).toBe('normal');
    expect(trashUrgency(4)).toBe('normal');
    expect(trashUrgency(3)).toBe('warning');
    expect(trashUrgency(2)).toBe('warning');
    expect(trashUrgency(1)).toBe('danger');
    expect(trashUrgency(0)).toBe('danger');
  });

  it('el badge marca el último día y nunca muestra 0', () => {
    expect(countdownLabel(7)).toBe('7 días');
    expect(countdownLabel(2)).toBe('2 días');
    expect(countdownLabel(1)).toBe('1 día (Último día)');
    expect(countdownLabel(0)).toBe('1 día (Último día)');
  });
});

describe('trash: purga reexportada', () => {
  it('conserva la lista a los 6 días y la elimina a los 7', () => {
    const viva = board(daysAgo(6));
    expect(purgeExpiredLists(viva, NOW)).toBe(false);
    expect(viva.trashedLists?.length).toBe(1);

    const vencida = board(daysAgo(7));
    expect(purgeExpiredLists(vencida, NOW)).toBe(true);
    expect(vencida.trashedLists).toEqual([]);
  });

  it('un tablero que nunca tuvo basurero no gana el campo por abrirlo', () => {
    const antiguo: ChecklistBoard = {
      id: 'board-1',
      title: 'Board',
      createdAt: '2026-01-01T00:00:00.000Z',
      lists: []
    };
    expect(purgeExpiredLists(antiguo, NOW)).toBe(false);
    expect(antiguo.trashedLists).toBeUndefined();
  });
});
