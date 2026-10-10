import { describe, expect, it } from 'vitest';
import {
  MASONRY_BREAKPOINT_PX,
  MASONRY_DESKTOP_COLUMNS,
  MASONRY_GAP,
  MASONRY_MOBILE_COLUMNS,
  MASONRY_MOBILE_MAX_WIDTH,
  calculateMasonryPositions
} from './masonry-layout';

/**
 * Pruebas del cálculo masonry. Migrado desde scripts/test-masonry.mjs.
 * Es cálculo puro: dónde cae cada tarjeta según las alturas medidas.
 */

describe('masonry-layout', () => {
  it('3 columnas con alturas distintas coloca cada tarjeta en la columna más corta', () => {
    const containerWidth = 900; // GAP=22, 3 cols -> itemWidth = (900 - 44) / 3 = 856 / 3 = 285.333...
    const heights = [100, 200, 150, 80, 50, 120];

    const result = calculateMasonryPositions(containerWidth, heights, { isMobile: false });

    expect(result.columns).toBe(3);
    expect(result.positions.length).toBe(6);

    // Colocación esperada:
    // Item 0 (100) -> col 0 (y=0), heights=[122, 0, 0]
    // Item 1 (200) -> col 1 (y=0), heights=[122, 222, 0]
    // Item 2 (150) -> col 2 (y=0), heights=[122, 222, 172]
    // Item 3 (80)  -> col 0 (menor es 122) (y=122), heights=[122+80+22=224, 222, 172]
    // Item 4 (50)  -> col 2 (menor es 172) (y=172), heights=[224, 222, 172+50+22=244]
    // Item 5 (120) -> col 1 (menor es 222) (y=222), heights=[224, 222+120+22=364, 244]

    expect(result.positions[0].column).toBe(0);
    expect(result.positions[0].top).toBe(0);

    expect(result.positions[1].column).toBe(1);
    expect(result.positions[1].top).toBe(0);

    expect(result.positions[2].column).toBe(2);
    expect(result.positions[2].top).toBe(0);

    expect(result.positions[3].column).toBe(0);
    expect(result.positions[3].top).toBe(100 + MASONRY_GAP);

    expect(result.positions[4].column).toBe(2);
    expect(result.positions[4].top).toBe(150 + MASONRY_GAP);

    expect(result.positions[5].column).toBe(1);
    expect(result.positions[5].top).toBe(200 + MASONRY_GAP);
  });

  it('1 columna en móvil (<=700px) apila verticalmente con ancho máximo 520px', () => {
    const containerWidth = 600; // <= 700 -> isMobile
    const heights = [100, 150, 200];

    const result = calculateMasonryPositions(containerWidth, heights, { isMobile: true });

    expect(result.columns).toBe(1);
    expect(result.itemWidth).toBe(Math.min(containerWidth, MASONRY_MOBILE_MAX_WIDTH));
    expect(result.itemWidth).toBe(520);
    expect(result.positions[0].left).toBe((600 - 520) / 2); // 40
    expect(result.positions[0].top).toBe(0);
    expect(result.positions[1].top).toBe(100 + MASONRY_GAP);
    expect(result.positions[2].top).toBe(100 + MASONRY_GAP + 150 + MASONRY_GAP);

    const expectedTotalHeight = 100 + MASONRY_GAP + 150 + MASONRY_GAP + 200;
    expect(result.totalHeight).toBe(expectedTotalHeight);
  });

  it('ancho 0 no coloca nada y devuelve posiciones vacías', () => {
    const heights = [100, 200, 300];
    const result = calculateMasonryPositions(0, heights);

    expect(result.positions.length).toBe(0);
    expect(result.totalHeight).toBe(0);
  });

  it('lista vacía devuelve altura 0 y posiciones vacías', () => {
    const result = calculateMasonryPositions(1024, []);

    expect(result.positions.length).toBe(0);
    expect(result.totalHeight).toBe(0);
  });

  it('la altura total resta el GAP final para no dejar espacio sobrante', () => {
    const containerWidth = 900;
    // 3 tarjetas de 100px cada una van una en cada columna
    const heights = [100, 100, 100];
    const result = calculateMasonryPositions(containerWidth, heights, { isMobile: false });

    // Cada columna tiene acumulado 100 + 22 = 122.
    // La altura total debe ser 122 - 22 = 100px exactos (no 122).
    expect(result.totalHeight).toBe(100);

    // 1 tarjeta de 300px
    const singleResult = calculateMasonryPositions(containerWidth, [300], { isMobile: false });
    expect(singleResult.totalHeight).toBe(300);
  });

  it('distribución equilibrada con alturas heterogéneas (30 tarjetas)', () => {
    const containerWidth = 1200;
    const heights = Array.from({ length: 30 }, (_, i) => 50 + (i % 7) * 40 + (i === 12 ? 500 : 0));
    const result = calculateMasonryPositions(containerWidth, heights, { isMobile: false });

    expect(result.positions.length).toBe(30);
    expect(result.columns).toBe(3);

    // Verificar que ninguna tarjeta en la misma columna se superponga
    for (let col = 0; col < 3; col++) {
      const colItems = result.positions
        .map((pos, index) => ({ ...pos, height: heights[index], index }))
        .filter((pos) => pos.column === col)
        .sort((a, b) => a.top - b.top);

      for (let i = 0; i < colItems.length - 1; i++) {
        const current = colItems[i];
        const next = colItems[i + 1];
        expect(
          next.top,
          `Superposición en col ${col} entre item ${current.index} y ${next.index}`
        ).toBeGreaterThanOrEqual(current.top + current.height + MASONRY_GAP);
      }
    }
  });

  it('comportamiento en anchos 320, 700, 701, 1024 y 1440px', () => {
    const heights = [120, 180, 90, 240];

    const res320 = calculateMasonryPositions(320, heights);
    expect(res320.columns).toBe(1);
    expect(res320.itemWidth).toBe(320); // Math.min(320, 520)

    const res700 = calculateMasonryPositions(700, heights);
    expect(res700.columns).toBe(1);
    expect(res700.itemWidth).toBe(520); // Math.min(700, 520)

    const res701 = calculateMasonryPositions(701, heights);
    expect(res701.columns).toBe(3);
    expect(res701.itemWidth).toBeGreaterThan(0);

    const res1024 = calculateMasonryPositions(1024, heights);
    expect(res1024.columns).toBe(3);
    expect(res1024.itemWidth).toBe((1024 - 22 * 2) / 3);

    const res1440 = calculateMasonryPositions(1440, heights);
    expect(res1440.columns).toBe(3);
    expect(res1440.itemWidth).toBe((1440 - 22 * 2) / 3);

    // Las constantes exportadas coinciden con lo que usa el cálculo por defecto.
    expect(MASONRY_GAP).toBe(22);
    expect(MASONRY_BREAKPOINT_PX).toBe(700);
    expect(MASONRY_DESKTOP_COLUMNS).toBe(3);
    expect(MASONRY_MOBILE_COLUMNS).toBe(1);
    expect(MASONRY_MOBILE_MAX_WIDTH).toBe(520);
  });
});
