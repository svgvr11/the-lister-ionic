import assert from 'node:assert/strict';
import {
  calculateMasonryPositions,
  MASONRY_GAP,
  MASONRY_BREAKPOINT_PX,
  MASONRY_MOBILE_MAX_WIDTH,
  MASONRY_DESKTOP_COLUMNS,
  MASONRY_MOBILE_COLUMNS
} from '../src/app/core/masonry-layout.ts';

let cases = 0;
const check = (label, fn) => {
  fn();
  cases++;
  console.log(`  ok  ${label}`);
};

// 1. Tres columnas con alturas distintas coloca cada tarjeta en la columna más corta
check('3 columnas con alturas distintas coloca cada tarjeta en la columna más corta', () => {
  const containerWidth = 900; // GAP=22, 3 cols -> itemWidth = (900 - 44) / 3 = 856 / 3 = 285.333...
  const heights = [100, 200, 150, 80, 50, 120];

  const result = calculateMasonryPositions(containerWidth, heights, { isMobile: false });

  assert.equal(result.columns, 3);
  assert.equal(result.positions.length, 6);

  // Colocación esperada:
  // Item 0 (100) -> col 0 (y=0), heights=[122, 0, 0]
  // Item 1 (200) -> col 1 (y=0), heights=[122, 222, 0]
  // Item 2 (150) -> col 2 (y=0), heights=[122, 222, 172]
  // Item 3 (80)  -> col 0 (menor es 122) (y=122), heights=[122+80+22=224, 222, 172]
  // Item 4 (50)  -> col 2 (menor es 172) (y=172), heights=[224, 222, 172+50+22=244]
  // Item 5 (120) -> col 1 (menor es 222) (y=222), heights=[224, 222+120+22=364, 244]

  assert.equal(result.positions[0].column, 0);
  assert.equal(result.positions[0].top, 0);

  assert.equal(result.positions[1].column, 1);
  assert.equal(result.positions[1].top, 0);

  assert.equal(result.positions[2].column, 2);
  assert.equal(result.positions[2].top, 0);

  assert.equal(result.positions[3].column, 0);
  assert.equal(result.positions[3].top, 100 + MASONRY_GAP);

  assert.equal(result.positions[4].column, 2);
  assert.equal(result.positions[4].top, 150 + MASONRY_GAP);

  assert.equal(result.positions[5].column, 1);
  assert.equal(result.positions[5].top, 200 + MASONRY_GAP);
});

// 2. 1 columna en móvil (≤700px) apila todas las tarjetas verticalmente centradas
check('1 columna en móvil (<=700px) apila verticalmente con ancho máximo 520px', () => {
  const containerWidth = 600; // <= 700 -> isMobile
  const heights = [100, 150, 200];

  const result = calculateMasonryPositions(containerWidth, heights, { isMobile: true });

  assert.equal(result.columns, 1);
  assert.equal(result.itemWidth, Math.min(containerWidth, MASONRY_MOBILE_MAX_WIDTH));
  assert.equal(result.itemWidth, 520);
  assert.equal(result.positions[0].left, (600 - 520) / 2); // 40
  assert.equal(result.positions[0].top, 0);
  assert.equal(result.positions[1].top, 100 + MASONRY_GAP);
  assert.equal(result.positions[2].top, 100 + MASONRY_GAP + 150 + MASONRY_GAP);

  const expectedTotalHeight = 100 + MASONRY_GAP + 150 + MASONRY_GAP + 200;
  assert.equal(result.totalHeight, expectedTotalHeight);
});

// 3. Ancho 0 no coloca nada y devuelve posiciones vacías
check('ancho 0 no coloca nada y devuelve posiciones vacias', () => {
  const heights = [100, 200, 300];
  const result = calculateMasonryPositions(0, heights);

  assert.equal(result.positions.length, 0);
  assert.equal(result.totalHeight, 0);
});

// 4. Lista vacía devuelve altura 0 y posiciones vacías
check('lista vacia devuelve altura 0 y posiciones vacias', () => {
  const result = calculateMasonryPositions(1024, []);

  assert.equal(result.positions.length, 0);
  assert.equal(result.totalHeight, 0);
});

// 5. Resta del GAP final a la altura total
check('la altura total resta el GAP final para no dejar espacio sobrante', () => {
  const containerWidth = 900;
  // 3 tarjetas de 100px cada una van una en cada columna
  const heights = [100, 100, 100];
  const result = calculateMasonryPositions(containerWidth, heights, { isMobile: false });

  // Cada columna tiene acumulado 100 + 22 = 122.
  // La altura total debe ser 122 - 22 = 100px exactos (no 122).
  assert.equal(result.totalHeight, 100);

  // 1 tarjeta de 300px
  const singleResult = calculateMasonryPositions(containerWidth, [300], { isMobile: false });
  assert.equal(singleResult.totalHeight, 300);
});

// 6. Tarjetas con alturas muy disparejas y títulos largos sin desbordes
check('distribucion equilibrada con alturas heterogeneas (30 tarjetas)', () => {
  const containerWidth = 1200;
  const heights = Array.from({ length: 30 }, (_, i) => 50 + (i % 7) * 40 + (i === 12 ? 500 : 0));
  const result = calculateMasonryPositions(containerWidth, heights, { isMobile: false });

  assert.equal(result.positions.length, 30);
  assert.equal(result.columns, 3);

  // Verificar que ninguna tarjeta en la misma columna se superponga
  for (let col = 0; col < 3; col++) {
    const colItems = result.positions
      .map((pos, index) => ({ ...pos, height: heights[index], index }))
      .filter((pos) => pos.column === col)
      .sort((a, b) => a.top - b.top);

    for (let i = 0; i < colItems.length - 1; i++) {
      const current = colItems[i];
      const next = colItems[i + 1];
      assert.ok(
        next.top >= current.top + current.height + MASONRY_GAP,
        `Superposición en col ${col} entre item ${current.index} y ${next.index}`
      );
    }
  }
});

// 7. Breakpoints y anchos estándar (320, 700, 701, 1024, 1440)
check('comportamiento en anchos 320, 700, 701, 1024 y 1440px', () => {
  const heights = [120, 180, 90, 240];

  const res320 = calculateMasonryPositions(320, heights);
  assert.equal(res320.columns, 1);
  assert.equal(res320.itemWidth, 320); // Math.min(320, 520)

  const res700 = calculateMasonryPositions(700, heights);
  assert.equal(res700.columns, 1);
  assert.equal(res700.itemWidth, 520); // Math.min(700, 520)

  const res701 = calculateMasonryPositions(701, heights);
  assert.equal(res701.columns, 3);
  assert.ok(res701.itemWidth > 0);

  const res1024 = calculateMasonryPositions(1024, heights);
  assert.equal(res1024.columns, 3);
  assert.equal(res1024.itemWidth, (1024 - 22 * 2) / 3);

  const res1440 = calculateMasonryPositions(1440, heights);
  assert.equal(res1440.columns, 3);
  assert.equal(res1440.itemWidth, (1440 - 22 * 2) / 3);
});

console.log(`masonry: ${cases} cases passed`);
