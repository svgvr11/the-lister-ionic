import { describe, expect, it, vi } from 'vitest';
import {
  describeDeviceTimeZone,
  formatLastUpdated,
  resolveListUpdatedAt,
  splitLastUpdated,
  touchList
} from './list-updated-at';
import type { ChecklistList } from '../../../models/board.model';

/**
 * Pruebas de la fecha de última modificación de una lista.
 *
 * Las zonas horarias que se pasan aquí son SOLO de prueba: el código de producción no fija
 * ninguna y usa siempre la del dispositivo (ver AGENTS.md). De hecho, uno de los casos
 * comprueba justamente eso.
 */

const lista = (campos: Partial<ChecklistList> = {}): ChecklistList => ({
  id: 'lista-1',
  boardId: 'tablero-1',
  title: 'Compra',
  position: 0,
  createdAt: '2025-11-02T22:31:00.000Z',
  tasks: [],
  ...campos
});

const tarea = (id: string, createdAt: string) => ({
  id,
  listId: 'lista-1',
  text: `Tarea ${id}`,
  completed: false,
  position: 0,
  createdAt
});

describe('list-updated-at: touchList', () => {
  it('fija la fecha que recibe', () => {
    const list = lista();
    expect(touchList(list, '2025-11-02T22:31:00.000Z')).toBe(true);
    expect(list.updatedAt).toBe('2025-11-02T22:31:00.000Z');
  });

  it('sin fecha usa el reloj del dispositivo y escribe un ISO legible', () => {
    const list = lista();
    const antes = Date.now();
    expect(touchList(list)).toBe(true);
    const instante = Date.parse(list.updatedAt!);
    expect(Number.isFinite(instante)).toBe(true);
    expect(instante).toBeGreaterThanOrEqual(antes - 1000);
  });

  it('sobrescribe una fecha anterior', () => {
    const list = lista({ updatedAt: '2025-01-01T00:00:00.000Z' });
    touchList(list, '2025-11-02T22:31:00.000Z');
    expect(list.updatedAt).toBe('2025-11-02T22:31:00.000Z');
  });

  it('una fecha ilegible no se escribe', () => {
    const list = lista({ updatedAt: '2025-11-02T22:31:00.000Z' });
    expect(touchList(list, 'no es una fecha')).toBe(false);
    expect(list.updatedAt).toBe('2025-11-02T22:31:00.000Z');
    expect(touchList(list, '')).toBe(false);
  });
});

describe('list-updated-at: resolveListUpdatedAt', () => {
  it('devuelve el updatedAt de la lista cuando existe', () => {
    const list = lista({
      updatedAt: '2025-11-02T22:31:00.000Z',
      tasks: [tarea('t1', '2025-06-01T10:00:00.000Z')]
    });
    expect(resolveListUpdatedAt(list)).toBe('2025-11-02T22:31:00.000Z');
  });

  it('sin updatedAt usa el createdAt más reciente entre la lista y sus tareas', () => {
    const list = lista({
      updatedAt: undefined,
      tasks: [
        tarea('t1', '2025-06-01T10:00:00.000Z'),
        tarea('t2', '2025-12-15T08:00:00.000Z')
      ]
    });
    expect(resolveListUpdatedAt(list)).toBe('2025-12-15T08:00:00.000Z');
  });

  it('sin updatedAt y con la lista más nueva que sus tareas, usa la de la lista', () => {
    const list = lista({
      updatedAt: undefined,
      createdAt: '2025-12-01T10:00:00.000Z',
      tasks: [tarea('t1', '2025-06-01T10:00:00.000Z')]
    });
    expect(resolveListUpdatedAt(list)).toBe('2025-12-01T10:00:00.000Z');
  });

  it('sin updatedAt y sin tareas usa el createdAt de la lista', () => {
    expect(resolveListUpdatedAt(lista({ updatedAt: undefined }))).toBe('2025-11-02T22:31:00.000Z');
  });

  it('un updatedAt corrupto cae al respaldo', () => {
    const list = lista({ updatedAt: 'aaaa', tasks: [tarea('t1', '2025-12-20T10:00:00.000Z')] });
    expect(resolveListUpdatedAt(list)).toBe('2025-12-20T10:00:00.000Z');
  });

  it('sin ninguna fecha legible devuelve null (la etiqueta no se pinta)', () => {
    const list = lista({ updatedAt: undefined, createdAt: '', tasks: [] });
    expect(resolveListUpdatedAt(list)).toBeNull();
  });
});

describe('list-updated-at: formatLastUpdated', () => {
  it('escribe la etiqueta con el formato fijo', () => {
    expect(formatLastUpdated('2025-11-02T22:31:00.000Z', { timeZone: 'UTC' }))
      .toBe('Última actualización: 2 de noviembre de 2025, 22:31');
  });

  it('el mes de un solo dígito va completo y el día sin cero inicial', () => {
    expect(formatLastUpdated('2026-03-09T07:05:00.000Z', { timeZone: 'UTC' }))
      .toBe('Última actualización: 9 de marzo de 2026, 07:05');
  });

  it('la medianoche son las 00:xx, nunca las 24:xx', () => {
    expect(formatLastUpdated('2026-01-01T00:07:00.000Z', { timeZone: 'UTC' }))
      .toBe('Última actualización: 1 de enero de 2026, 00:07');
  });

  it('el cambio de año se respeta', () => {
    expect(formatLastUpdated('2025-12-31T23:59:00.000Z', { timeZone: 'UTC' }))
      .toBe('Última actualización: 31 de diciembre de 2025, 23:59');
  });

  it('la hora depende de la zona que se le pase', () => {
    const iso = '2025-11-02T22:31:00.000Z';
    expect(formatLastUpdated(iso, { timeZone: 'America/Santiago' }))
      .toBe('Última actualización: 2 de noviembre de 2025, 19:31');
    expect(formatLastUpdated(iso, { timeZone: 'Asia/Tokyo' }))
      .toBe('Última actualización: 3 de noviembre de 2025, 07:31');
  });

  it('sin timeZone usa la zona del entorno, igual que pasarla explícita', () => {
    const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const iso = '2025-11-02T22:31:00.000Z';
    expect(formatLastUpdated(iso)).toBe(formatLastUpdated(iso, { timeZone: zona }));
  });

  it('una zona inválida no lanza: cae en la del dispositivo', () => {
    const iso = '2025-11-02T22:31:00.000Z';
    expect(() => formatLastUpdated(iso, { timeZone: 'Marte/Olimpia' })).not.toThrow();
    expect(formatLastUpdated(iso, { timeZone: 'Marte/Olimpia' })).toBe(
      formatLastUpdated(iso, { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
    );
  });

  it('fecha inválida o ausente devuelve la cadena vacía', () => {
    expect(formatLastUpdated('no es una fecha')).toBe('');
    expect(formatLastUpdated('')).toBe('');
    expect(formatLastUpdated(null)).toBe('');
    expect(formatLastUpdated(undefined)).toBe('');
  });
});

describe('list-updated-at: splitLastUpdated', () => {
  it('separa el texto fijo de la fecha con la hora', () => {
    expect(splitLastUpdated('Última actualización: 2 de noviembre de 2025, 19:31')).toEqual({
      etiqueta: 'Última actualización:',
      fecha: '2 de noviembre de 2025, 19:31'
    });
  });

  it('una etiqueta sin prefijo se devuelve entera', () => {
    expect(splitLastUpdated('Otra cosa')).toEqual({ etiqueta: 'Otra cosa', fecha: '' });
    expect(splitLastUpdated('')).toEqual({ etiqueta: '', fecha: '' });
  });

  it('solo corta por el primer separador', () => {
    // La fecha lleva comas: el corte es el del prefijo, no el de dentro.
    expect(splitLastUpdated('Última actualización: 1 de enero de 2026, 00:07')).toEqual({
      etiqueta: 'Última actualización:',
      fecha: '1 de enero de 2026, 00:07'
    });
  });
});

describe('list-updated-at: describeDeviceTimeZone', () => {
  it('nombra la zona y su desfase en ese instante', () => {
    expect(describeDeviceTimeZone('2025-11-02T22:31:00.000Z', { timeZone: 'America/Santiago' }))
      .toBe('Zona horaria del dispositivo: America/Santiago (GMT-03:00)');
  });

  it('el desfase es el del instante, no uno fijo por identificador', () => {
    // La misma zona, en invierno y en verano: el horario de verano cambia el desfase.
    expect(describeDeviceTimeZone('2025-11-02T22:31:00.000Z', { timeZone: 'America/Santiago' }))
      .toContain('GMT-03:00');
    expect(describeDeviceTimeZone('2025-07-02T22:31:00.000Z', { timeZone: 'America/Santiago' }))
      .toContain('GMT-04:00');
  });

  it('UTC se nombra con lo que dé el motor', () => {
    // Para UTC el motor escribe «GMT» a secas, sin horas: se muestra tal cual.
    expect(describeDeviceTimeZone('2025-11-02T22:31:00.000Z', { timeZone: 'UTC' }))
      .toBe('Zona horaria del dispositivo: UTC (GMT)');
  });

  it('sin timeZone usa la zona del entorno, igual que pasarla explícita', () => {
    const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const iso = '2025-11-02T22:31:00.000Z';
    expect(describeDeviceTimeZone(iso)).toBe(describeDeviceTimeZone(iso, { timeZone: zona }));
  });

  it('una zona inválida no lanza', () => {
    expect(() => describeDeviceTimeZone('2025-11-02T22:31:00.000Z', { timeZone: 'Marte/Olimpia' }))
      .not.toThrow();
    expect(describeDeviceTimeZone('2025-11-02T22:31:00.000Z', { timeZone: 'Marte/Olimpia' }))
      .toContain('Zona horaria del dispositivo');
  });

  it('fecha inválida o ausente devuelve la cadena vacía', () => {
    expect(describeDeviceTimeZone('no es una fecha')).toBe('');
    expect(describeDeviceTimeZone(null)).toBe('');
  });

  /**
   * Un motor sin `longOffset` no devuelve el desfase: el tooltip se queda con el identificador
   * a secas en lugar de romperse.
   */
  it('un motor sin longOffset deja el tooltip solo con el identificador', () => {
    const real = Intl.DateTimeFormat;
    const espia = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(((
      locale?: string | string[],
      options?: Intl.DateTimeFormatOptions
    ) => {
      // Esta zona solo la usa esta prueba, así que no pisa la caché de las demás.
      if (options?.timeZoneName !== 'longOffset') return new real(locale, options);
      const { timeZoneName: _nombre, ...resto } = options;
      return new real(locale, { ...resto, timeZone: 'Europe/Madrid' });
    }) as unknown as typeof Intl.DateTimeFormat);

    try {
      const texto = describeDeviceTimeZone('2025-11-02T22:31:00.000Z', { timeZone: 'Europe/Madrid' });
      expect(texto).toBe('Zona horaria del dispositivo: Europe/Madrid');
    } finally {
      espia.mockRestore();
    }
  });
});
