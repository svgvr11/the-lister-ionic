import { describe, expect, it } from 'vitest';
import { scrollDestinationForCard } from './scroll-into-view';

const MARGEN = 20;

describe('scrollDestinationForCard', () => {
  it('tarjeta totalmente visible con margen: no hace scroll', () => {
    // Área visible [100, 900]; tarjeta [150, 350] con margen 20 → dentro [120, 880].
    expect(scrollDestinationForCard(150, 200, 800, 100, MARGEN)).toBeNull();
  });

  it('tarjeta totalmente visible sin margen sobrante: no hace scroll', () => {
    // Tarjeta [120, 880] sobre área visible [100, 900]: justo con margen, sin scroll.
    expect(scrollDestinationForCard(120, 760, 800, 100, MARGEN)).toBeNull();
  });

  it('tarjeta debajo del viewport: destino deja la tarjeta entera con margen', () => {
    // Área visible [0, 800]; tarjeta [900, 1100] → destino 1100 − 800 + 20 = 320.
    expect(scrollDestinationForCard(900, 200, 800, 0, MARGEN)).toBe(320);
  });

  it('tarjeta parcialmente cortada abajo: scroll para que quepa entera', () => {
    // Área visible [0, 800]; tarjeta [750, 900] → destino 900 − 800 + 20 = 120.
    expect(scrollDestinationForCard(750, 150, 800, 0, MARGEN)).toBe(120);
  });

  it('tarjeta por encima del viewport: scroll hacia arriba', () => {
    // Área visible [500, 1300]; tarjeta [300, 450] → destino 300 − 20 = 280.
    expect(scrollDestinationForCard(300, 150, 800, 500, MARGEN)).toBe(280);
  });

  it('tarjeta más alta que el viewport: alinea el borde superior', () => {
    // Área visible [0, 800]; tarjeta [1000, 2100] (más alta que el viewport) → 1000 − 20 = 980.
    expect(scrollDestinationForCard(1000, 1100, 800, 0, MARGEN)).toBe(980);
  });

  it('respeta el margen solicitado (24 px)', () => {
    // Tarjeta [900, 1100], área visible [0, 800] → 1100 − 800 + 24 = 324.
    expect(scrollDestinationForCard(900, 200, 800, 0, 24)).toBe(324);
  });

  it('tarjeta que pega al borde superior sin margen: scrollea para abrir el margen', () => {
    // Área visible [0, 800]; tarjeta [0, 200] → topLimit 20, se desplaza 0 − 20 = −20.
    expect(scrollDestinationForCard(0, 200, 800, 0, MARGEN)).toBe(-20);
  });

  it('tarjeta que pega al borde inferior sin margen: scrollea hacia abajo', () => {
    // Área visible [0, 800]; tarjeta [700, 800] → bottomLimit 780, destino 800 − 800 + 20 = 20.
    expect(scrollDestinationForCard(700, 100, 800, 0, MARGEN)).toBe(20);
  });

  it('tarjeta parcialmente cortada arriba ya visible: sin scroll si cumple el margen', () => {
    // Área visible [100, 900]; tarjeta [130, 300] → topLimit 120, bottomLimit 880: visible.
    expect(scrollDestinationForCard(130, 170, 800, 100, MARGEN)).toBeNull();
  });
});
