import { describe, expect, it } from 'vitest';
import {
  MASONRY_GAP,
  MASONRY_HYSTERESIS_PX,
  MASONRY_MAX_COLUMNS,
  MASONRY_MOBILE_MAX_WIDTH,
  MASONRY_THREE_COLUMNS_MIN_WIDTH,
  MASONRY_TWO_COLUMNS_MIN_WIDTH,
  MasonryController,
  calculateMasonryPositions,
  computeCardWidth,
  computeColumnCount
} from './masonry-layout';

/**
 * Pruebas del cálculo masonry. Migrado desde scripts/test-masonry.mjs.
 * Es cálculo puro: dónde cae cada tarjeta según las alturas medidas.
 */

describe('masonry-layout', () => {
  it('3 columnas con alturas distintas coloca cada tarjeta en la columna más corta', () => {
    const containerWidth = 1200; // GAP=22, 3 cols -> itemWidth = (1200 - 44) / 3
    const heights = [100, 200, 150, 80, 50, 120];

    const result = calculateMasonryPositions(containerWidth, heights);

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

  it('1 columna centrada con ancho máximo de 520px', () => {
    const containerWidth = 600; // < 640 -> 1 columna
    const heights = [100, 150, 200];

    const result = calculateMasonryPositions(containerWidth, heights);

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
    const containerWidth = 1200;
    // 3 tarjetas de 100px cada una van una en cada columna
    const heights = [100, 100, 100];
    const result = calculateMasonryPositions(containerWidth, heights);

    // Cada columna tiene acumulado 100 + 22 = 122.
    // La altura total debe ser 122 - 22 = 100px exactos (no 122).
    expect(result.totalHeight).toBe(100);

    // 1 tarjeta de 300px
    const singleResult = calculateMasonryPositions(containerWidth, [300]);
    expect(singleResult.totalHeight).toBe(300);
  });

  it('distribución equilibrada con alturas heterogéneas (30 tarjetas)', () => {
    const containerWidth = 1200;
    const heights = Array.from({ length: 30 }, (_, i) => 50 + (i % 7) * 40 + (i === 12 ? 500 : 0));
    const result = calculateMasonryPositions(containerWidth, heights);

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

  it('comportamiento en anchos 360, 700, 701, 1024 y 1440px', () => {
    const heights = [120, 180, 90, 240];

    const res360 = calculateMasonryPositions(360, heights);
    expect(res360.columns).toBe(1);
    expect(res360.itemWidth).toBe(360); // Math.min(360, 520)

    const res700 = calculateMasonryPositions(700, heights);
    expect(res700.columns).toBe(2);
    expect(res700.itemWidth).toBe((700 - MASONRY_GAP) / 2);

    const res701 = calculateMasonryPositions(701, heights);
    expect(res701.columns).toBe(2);
    expect(res701.itemWidth).toBe((701 - MASONRY_GAP) / 2);

    const res1024 = calculateMasonryPositions(1024, heights);
    expect(res1024.columns).toBe(3);
    expect(res1024.itemWidth).toBe((1024 - MASONRY_GAP * 2) / 3);

    const res1440 = calculateMasonryPositions(1440, heights);
    expect(res1440.columns).toBe(3);
    expect(res1440.itemWidth).toBe((1440 - MASONRY_GAP * 2) / 3);

    // Las constantes exportadas coinciden con lo que usa el cálculo por defecto.
    expect(MASONRY_GAP).toBe(22);
    expect(MASONRY_MAX_COLUMNS).toBe(3);
    expect(MASONRY_TWO_COLUMNS_MIN_WIDTH).toBe(640);
    expect(MASONRY_THREE_COLUMNS_MIN_WIDTH).toBe(1000);
    expect(MASONRY_MOBILE_MAX_WIDTH).toBe(520);
    expect(MASONRY_HYSTERESIS_PX).toBe(16);
  });
});

/**
 * Columnas según el ancho del CONTENEDOR (no de la ventana) e histéresis.
 */
describe('computeColumnCount', () => {
  it('usa los umbrales pelados en la primera pasada (sin columnas previas)', () => {
    // 3 columnas desde 1000 px.
    expect(computeColumnCount(1000)).toBe(3);
    expect(computeColumnCount(1440)).toBe(3);
    // 2 columnas entre 640 y 999 px.
    expect(computeColumnCount(640)).toBe(2);
    expect(computeColumnCount(999)).toBe(2);
    // 1 columna por debajo.
    expect(computeColumnCount(639)).toBe(1);
    expect(computeColumnCount(360)).toBe(1);
  });

  it('respeta los umbrales exactos: 999/1000 y 639/640', () => {
    expect(computeColumnCount(999)).toBe(2);
    expect(computeColumnCount(1000)).toBe(3);
    expect(computeColumnCount(639)).toBe(1);
    expect(computeColumnCount(640)).toBe(2);
  });

  it('con ancho 0 (o negativo) no coloca nada', () => {
    expect(computeColumnCount(0)).toBe(0);
    expect(computeColumnCount(-10)).toBe(0);
  });

  it('subir de columna exige umbral + histéresis', () => {
    // Partiendo de 2 columnas, 1000 px ya no basta: hay que pasar 1000 + 16.
    expect(computeColumnCount(1000, 2)).toBe(2);
    expect(computeColumnCount(1015, 2)).toBe(2);
    expect(computeColumnCount(1016, 2)).toBe(3);

    // Partiendo de 1 columna, 640 px ya no basta: hay que pasar 640 + 16.
    expect(computeColumnCount(640, 1)).toBe(1);
    expect(computeColumnCount(655, 1)).toBe(1);
    expect(computeColumnCount(656, 1)).toBe(2);
  });

  it('bajar de columna exige umbral − histéresis', () => {
    // Partiendo de 3 columnas hay que bajar de 1000 − 16 para perder la tercera.
    expect(computeColumnCount(985, 3)).toBe(3);
    expect(computeColumnCount(984, 3)).toBe(3);
    expect(computeColumnCount(983, 3)).toBe(2);

    // Partiendo de 2 columnas hay que bajar de 640 − 16 para quedarse en una.
    expect(computeColumnCount(625, 2)).toBe(2);
    expect(computeColumnCount(624, 2)).toBe(2);
    expect(computeColumnCount(623, 2)).toBe(1);
  });

  it('no alterna columnas al oscilar unos pocos píxeles (barra de scroll)', () => {
    // La barra de scroll vertical mueve el ancho del contenedor unos pocos píxeles: con
    // histéresis eso no debe hacer vibrar el número de columnas.
    for (const width of [1000, 985, 1000, 988, 1002, 986, 1000]) {
      expect(computeColumnCount(width, 3), `ancho ${width} partiendo de 3`).toBe(3);
    }
    for (const width of [640, 625, 640, 630, 645, 626, 640]) {
      expect(computeColumnCount(width, 2), `ancho ${width} partiendo de 2`).toBe(2);
    }
  });

  it('no alterna al subir y bajar de forma continua (secuencias)', () => {
    // Secuencia bajando desde escritorio ancho.
    const goingDown = [1440, 1100, 900, 800, 700, 500, 360];
    let columns = 0;
    expect(goingDown.map((width) => (columns = computeColumnCount(width, columns))))
      .toEqual([3, 3, 2, 2, 2, 1, 1]);

    // Secuencia subiendo de vuelta: por histéresis no tiene por qué ser la simétrica.
    let back = 0;
    expect([...goingDown].reverse().map((width) => (back = computeColumnCount(width, back))))
      .toEqual([1, 1, 2, 2, 2, 3, 3]);
  });

  it('oscilación de ±10 px alrededor de un umbral no cambia las columnas', () => {
    let columns = computeColumnCount(1000); // 3
    for (const width of [990, 1000, 995, 1005, 992, 1000]) {
      columns = computeColumnCount(width, columns);
      expect(columns).toBe(3);
    }
  });
});

describe('computeCardWidth', () => {
  it('reparte el ancho sobrante tras los gaps entre las columnas', () => {
    expect(computeCardWidth(1440, 3)).toBe((1440 - MASONRY_GAP * 2) / 3);
    expect(computeCardWidth(700, 2)).toBe((700 - MASONRY_GAP) / 2);
  });

  it('en 1 columna mantiene el máximo de 520px centrado', () => {
    expect(computeCardWidth(600, 1)).toBe(MASONRY_MOBILE_MAX_WIDTH);
    expect(computeCardWidth(1200, 1)).toBe(MASONRY_MOBILE_MAX_WIDTH);
    // Por debajo del máximo usa todo el ancho (móvil angosto).
    expect(computeCardWidth(360, 1)).toBe(360);
  });

  it('devuelve 0 sin ancho o sin columnas', () => {
    expect(computeCardWidth(0, 3)).toBe(0);
    expect(computeCardWidth(1000, 0)).toBe(0);
  });
});

/**
 * Ciclo de vida del observador con un ResizeObserver falso: sin DOM real.
 *
 * Cubre justo la causa del bug: el observador debe quedar atado al nodo VIVO, con un
 * solo nodo observado a la vez, y soltar el anterior cuando el `*ngIf` recree la rejilla.
 */
describe('MasonryController (ciclo de vida del observador)', () => {
  /** ResizeObserver falso: registra los nodos observados y permite disparar el callback. */
  class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    /** Veces que se llamó disconnect(): sirve para comprobar que se suelta el viejo. */
    static disconnectCalls = 0;
    readonly observed = new Set<unknown>();

    private readonly callback: () => void;

    constructor(callback: () => void) {
      this.callback = callback;
      FakeResizeObserver.instances.push(this);
    }

    observe(target: unknown): void {
      this.observed.add(target);
    }

    unobserve(target: unknown): void {
      this.observed.delete(target);
    }

    disconnect(): void {
      this.observed.clear();
      FakeResizeObserver.disconnectCalls++;
    }

    /** Simula un cambio de tamaño del nodo observado. */
    fire(): void {
      this.callback();
    }
  }

  /** Elemento mínimo para que `applyMasonryLayout` pueda trabajar sin DOM real. */
  function fakeElement(width: number): HTMLElement {
    const node = {
      style: {} as Record<string, string>,
      clientWidth: width,
      offsetHeight: 100,
      getBoundingClientRect: () => ({ height: 0, width })
    };
    return node as unknown as HTMLElement;
  }

  function fakeItem(): HTMLElement {
    return { style: {} as Record<string, string>, offsetHeight: 100 } as unknown as HTMLElement;
  }

  function setup(initialWidth = 1000) {
    FakeResizeObserver.instances = [];
    FakeResizeObserver.disconnectCalls = 0;
    let container: HTMLElement | null = fakeElement(initialWidth);
    const items = [fakeItem(), fakeItem(), fakeItem()];
    const controller = new MasonryController({
      gap: MASONRY_GAP,
      getContainer: () => container,
      getItems: () => items
    });
    return {
      controller,
      items,
      setContainer: (next: HTMLElement | null) => { container = next; },
      getContainer: () => container as HTMLElement,
      observers: () => FakeResizeObserver.instances,
      /** Nodos observados AHORA por todos los observadores creados. */
      observedNodes: () =>
        FakeResizeObserver.instances.flatMap((o) => [...o.observed])
    };
  }

  /** Sustituye el global solo durante el test. */
  function withFakeObserver<T>(fn: () => T): T {
    const globalObject = globalThis as { ResizeObserver?: unknown };
    const original = globalObject.ResizeObserver;
    globalObject.ResizeObserver = FakeResizeObserver;
    try {
      return fn();
    } finally {
      globalObject.ResizeObserver = original;
    }
  }

  /** requestAnimationFrame/cancelAnimationFrame síncronos, sin depender del event loop. */
  function withSyncRaf<T>(fn: () => T): T {
    const originalRaf = globalThis.requestAnimationFrame;
    const originalCancel = (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    }) as typeof requestAnimationFrame;
    (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = () => undefined;
    try {
      return fn();
    } finally {
      globalThis.requestAnimationFrame = originalRaf;
      (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = originalCancel;
    }
  }

  /** Ancho de tarjeta esperado en px, tal como lo escribe `applyMasonryLayout`. */
  const px = (value: number) => `${value}px`;

  it('observa el contenedor que se le pasa', () => {
    withFakeObserver(() => {
      const ctx = setup();
      withSyncRaf(() => {
        ctx.controller.observe(ctx.getContainer());
        expect(ctx.observers()).toHaveLength(1);
        expect(ctx.observedNodes()).toEqual([ctx.getContainer()]);
      });
    });
  });

  it('nunca deja más de un nodo observado al recrearse el contenedor', () => {
    withFakeObserver(() => {
      const ctx = setup();
      withSyncRaf(() => {
        const first = ctx.getContainer();
        ctx.controller.observe(first);

        // El *ngIf recrea la rejilla: llega un nodo nuevo.
        const second = fakeElement(1200);
        ctx.setContainer(second);
        ctx.controller.observe(second);

        // Un solo nodo observado: el nuevo. El viejo se soltó con disconnect().
        expect(ctx.observedNodes()).toEqual([second]);
        expect(ctx.observedNodes()).not.toContain(first);
        expect(FakeResizeObserver.disconnectCalls).toBeGreaterThanOrEqual(1);
      });
    });
  });

  it('es idempotente: observar el mismo nodo dos veces no reconecta', () => {
    withFakeObserver(() => {
      const ctx = setup();
      withSyncRaf(() => {
        const node = ctx.getContainer();
        ctx.controller.observe(node);
        ctx.controller.observe(node);
        expect(ctx.observers()).toHaveLength(1);
        expect(ctx.observedNodes()).toEqual([node]);
      });
    });
  });

  it('release() suelta el nodo observado', () => {
    withFakeObserver(() => {
      const ctx = setup();
      withSyncRaf(() => {
        const node = ctx.getContainer();
        ctx.controller.observe(node);
        ctx.controller.release(node);
        expect(ctx.observedNodes()).toEqual([]);
        expect(FakeResizeObserver.disconnectCalls).toBe(1);
      });
    });
  });

  it('release() de un nodo que no es el observado no suelta el vivo', () => {
    withFakeObserver(() => {
      const ctx = setup();
      withSyncRaf(() => {
        ctx.controller.observe(ctx.getContainer());
        ctx.controller.release(fakeElement(500));
        expect(ctx.observedNodes()).toEqual([ctx.getContainer()]);
      });
    });
  });

  it('disconnect() libera observador y nodos: sin fugas', () => {
    withFakeObserver(() => {
      const ctx = setup();
      withSyncRaf(() => {
        ctx.controller.observe(ctx.getContainer());
        ctx.controller.disconnect();
        expect(ctx.observedNodes()).toEqual([]);
      });
    });
  });

  it('se reconecta al nodo vivo si el contenedor cambió sin avisar (respaldo)', () => {
    withFakeObserver(() => {
      const ctx = setup(1000);
      withSyncRaf(() => {
        ctx.controller.observe(ctx.getContainer());
        // El *ngIf recrea el nodo sin pasar por observe().
        const recreated = fakeElement(800);
        ctx.setContainer(recreated);
        // scheduleLayout() reconcilia el nodo antes de calcular.
        ctx.controller.scheduleLayout();
        expect(ctx.observedNodes()).toEqual([recreated]);
      });
    });
  });

  it('recalcula con el ancho nuevo cuando el observador dispara', () => {
    withFakeObserver(() => {
      const ctx = setup(1000);
      withSyncRaf(() => {
        ctx.controller.observe(ctx.getContainer());
        ctx.controller.scheduleLayout();
        // A 1000 px: 3 columnas.
        expect(ctx.items[0].style.width).toBe(px((1000 - MASONRY_GAP * 2) / 3));

        // El contenedor se ensancha y el observador dispara.
        ctx.setContainer(fakeElement(1400));
        ctx.observers()[0].fire();
        expect(ctx.items[0].style.width).toBe(px((1400 - MASONRY_GAP * 2) / 3));
      });
    });
  });

  it('conserva las columnas previas entre pasadas (histéresis en el controller)', () => {
    withFakeObserver(() => {
      const ctx = setup(1000);
      withSyncRaf(() => {
        ctx.controller.observe(ctx.getContainer());
        ctx.controller.scheduleLayout();
        expect(ctx.items[0].style.width).toBe(px((1000 - MASONRY_GAP * 2) / 3));

        // Bajar a 1000 px partiendo de 3 columnas NO debe soltar la tercera.
        ctx.setContainer(fakeElement(1000));
        ctx.observers()[0].fire();
        expect(ctx.items[0].style.width).toBe(px((1000 - MASONRY_GAP * 2) / 3));

        // Bajar de verdad por debajo del umbral menos histéresis sí cambia a 2.
        ctx.setContainer(fakeElement(900));
        ctx.observers()[0].fire();
        expect(ctx.items[0].style.width).toBe(px((900 - MASONRY_GAP) / 2));
      });
    });
  });

  it('con ancho 0 no coloca nada y reintenta al recuperar el tamaño', () => {
    withFakeObserver(() => {
      const ctx = setup(1000);
      withSyncRaf(() => {
        ctx.controller.observe(ctx.getContainer());
        ctx.controller.scheduleLayout();
        const widthAtThree = ctx.items[0].style.width;
        expect(widthAtThree).toBe(px((1000 - MASONRY_GAP * 2) / 3));

        // La página se oculta: ancho 0. No debe tocar las posiciones.
        ctx.setContainer(fakeElement(0));
        ctx.observers()[0].fire();
        expect(ctx.items[0].style.width).toBe(widthAtThree);

        // Al recuperar el tamaño recalcula con el ancho nuevo.
        ctx.setContainer(fakeElement(700));
        ctx.observers()[0].fire();
        expect(ctx.items[0].style.width).toBe(px((700 - MASONRY_GAP) / 2));
      });
    });
  });

  it('las columnas nunca superan el máximo configurado', () => {
    expect(MASONRY_MAX_COLUMNS).toBe(3);
    expect(computeColumnCount(4000)).toBe(MASONRY_MAX_COLUMNS);
    expect(MASONRY_HYSTERESIS_PX).toBeLessThan(
      MASONRY_THREE_COLUMNS_MIN_WIDTH - MASONRY_TWO_COLUMNS_MIN_WIDTH
    );
  });
});
