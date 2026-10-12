import { beforeEach, describe, expect, it } from 'vitest';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ARCHIVE_RETENTION_DAYS } from '../../core/archive';
import { APP_VERSION_LABEL } from '../../core/app-version';
import { TRASH_RETENTION_DAYS } from '../../core/trash';
import { WelcomeModalComponent } from './welcome-modal.component';

/**
 * Pruebas de montaje del modal de bienvenida: la lógica pura está en
 * `core/welcome-tour.ts` (con su propia spec); aquí se comprueba el comportamiento
 * que solo se ve con el componente montado (foco inicial, teclado, swipe y cierres).
 */

function montar(): {
  fixture: ComponentFixture<WelcomeModalComponent>;
  component: WelcomeModalComponent;
  host: HTMLElement;
  cerrados: number[];
} {
  const fixture = TestBed.createComponent(WelcomeModalComponent);
  const cerrados: number[] = [];
  fixture.componentInstance.closed.subscribe(() => cerrados.push(1));
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, host: fixture.nativeElement, cerrados };
}

function contador(host: HTMLElement): string {
  return (host.querySelector('.welcome-counter') as HTMLElement).textContent?.trim() ?? '';
}

function botonPrincipal(host: HTMLElement): HTMLButtonElement {
  return host.querySelector('.welcome-primary') as HTMLButtonElement;
}

function botonAnterior(host: HTMLElement): HTMLButtonElement {
  return host.querySelector('.welcome-prev') as HTMLButtonElement;
}

/**
 * Evento táctil mínimo: jsdom no construye TouchEvent, pero el componente solo lee
 * `changedTouches[0]`, así que basta con definirlo a mano.
 */
function toque(tipo: 'touchstart' | 'touchend', x: number, y: number): Event {
  const event = new Event(tipo, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'changedTouches', { value: [{ clientX: x, clientY: y }] });
  return event;
}

/** Igual que montar(), pero en la variante móvil (input `variant`). */
function montarMovil(): {
  fixture: ComponentFixture<WelcomeModalComponent>;
  component: WelcomeModalComponent;
  host: HTMLElement;
  cerrados: number[];
} {
  const montado = montar();
  montado.fixture.componentRef.setInput('variant', 'mobile');
  montado.fixture.detectChanges();
  return montado;
}

describe('WelcomeModalComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WelcomeModalComponent],
      providers: [provideRouter([])]
    });
  });

  it('abre en la primera página, con el diálogo bien etiquetado y el foco en «Siguiente»', () => {
    const { host } = montar();
    const dialog = host.querySelector('.welcome-dialog') as HTMLElement;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('welcome-tour-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('welcome-tour-description');
    expect(contador(host)).toBe('1 de 4');
    expect((host.querySelector('.welcome-counter') as HTMLElement).getAttribute('aria-live')).toBe('polite');
    expect(botonAnterior(host).disabled).toBe(true);
    expect(document.activeElement).toBe(botonPrincipal(host));
  });

  it('navega con el ratón y con las flechas, sin pasar de los extremos', () => {
    const { component, host, fixture } = montar();
    const next = botonPrincipal(host);

    next.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(contador(host)).toBe('2 de 4');
    expect(botonAnterior(host).disabled).toBe(false);

    // Enter sobre el botón no avanza dos páginas: lo gestiona el clic del propio botón.
    next.click();
    fixture.detectChanges();
    expect(contador(host)).toBe('3 de 4');

    next.click();
    fixture.detectChanges();
    expect(contador(host)).toBe('4 de 4');
    expect(botonPrincipal(host).textContent).toContain('¡Empezar a organizar!');

    next.click();
    fixture.detectChanges();
    expect(contador(host)).toBe('4 de 4');

    botonAnterior(host).click();
    fixture.detectChanges();
    expect(contador(host)).toBe('3 de 4');

    component.prev();
    component.prev();
    component.prev();
    fixture.detectChanges();
    expect(contador(host)).toBe('1 de 4');
  });

  it('los plazos del basurero y del archivo salen de las constantes, no escritos a mano', () => {
    const { component, host, fixture } = montar();
    component.currentPage = 2;
    fixture.detectChanges();
    expect(component.pages[2].cards[0].title).toBe(`Basurero de ${TRASH_RETENTION_DAYS} días`);
    expect(component.pages[2].cards[1].title).toBe(`Archivo de ${ARCHIVE_RETENTION_DAYS} días`);
    expect(host.textContent).toContain('Recuperable');
    expect(host.textContent).toContain('Histórico');
  });

  it('cierra por «Saltar», por el fondo y por el botón de la última página', () => {
    const saltar = montar();
    (saltar.host.querySelector('.welcome-skip') as HTMLButtonElement).click();
    expect(saltar.cerrados.length).toBe(1);

    const fondo = montar();
    (fondo.host.querySelector('.welcome-overlay') as HTMLElement).click();
    expect(fondo.cerrados.length).toBe(1);

    const ultima = montar();
    ultima.component.currentPage = 3;
    botonPrincipal(ultima.host).click();
    expect(ultima.cerrados.length).toBe(1);
  });
});

describe('WelcomeModalComponent (variante móvil)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WelcomeModalComponent],
      providers: [provideRouter([])]
    });
  });

  it('la cabecera lleva la X en lugar de «Saltar» y el pie, el copyright real', () => {
    const { host } = montarMovil();
    expect(host.querySelector('.welcome-skip')).toBeNull();
    const cerrar = host.querySelector('.welcome-close') as HTMLButtonElement;
    expect(cerrar).toBeTruthy();
    expect(cerrar.getAttribute('aria-label')).toBe('Cerrar guía');
    // Sin marca ni chip de sección, como en el prototipo.
    expect(host.querySelector('.welcome-brand')).toBeNull();
    expect(host.querySelector('.welcome-chip')).toBeNull();
    expect(host.textContent).toContain(`${new Date().getFullYear()} Atenis / The Lister`);
  });

  it('el badge de versión solo se ve en móvil, en la misma fila que el contador y la X', () => {
    const movil = montarMovil();
    const versionMovil = movil.host.querySelector('.welcome-version') as HTMLElement;
    expect(versionMovil).toBeTruthy();
    expect(versionMovil.textContent?.trim()).toBe(APP_VERSION_LABEL);
    // Mismo contenedor flex que el contador y el botón de cerrar.
    const cabecera = movil.host.querySelector('.welcome-header') as HTMLElement;
    const lado = movil.host.querySelector('.welcome-header-side') as HTMLElement;
    expect(versionMovil.parentElement).toBe(cabecera);
    expect(lado.parentElement).toBe(cabecera);

    const escritorio = montar();
    expect(escritorio.host.querySelector('.welcome-version')).toBeNull();
  });

  it('tiene tres slides: contador «1 de 3» y tarjeta central en la última', () => {
    const { component, host, fixture } = montarMovil();
    expect(contador(host)).toBe('1 de 3');

    component.currentPage = 2;
    fixture.detectChanges();
    expect(contador(host)).toBe('3 de 3');
    expect(host.querySelector('.welcome-hero')).toBeTruthy();
    expect(host.textContent).toContain('¡Todo listo!');
    expect(botonPrincipal(host).textContent).toContain('¡Empezar!');
  });

  it('el swipe horizontal cambia de slide y el vertical no', () => {
    const { host, fixture } = montarMovil();
    const body = host.querySelector('.welcome-body') as HTMLElement;

    body.dispatchEvent(toque('touchstart', 200, 300));
    body.dispatchEvent(toque('touchend', 120, 300));
    fixture.detectChanges();
    expect(contador(host)).toBe('2 de 3');

    body.dispatchEvent(toque('touchstart', 200, 300));
    body.dispatchEvent(toque('touchend', 210, 200));
    fixture.detectChanges();
    expect(contador(host)).toBe('2 de 3');

    body.dispatchEvent(toque('touchstart', 200, 300));
    body.dispatchEvent(toque('touchend', 260, 305));
    fixture.detectChanges();
    expect(contador(host)).toBe('1 de 3');
  });

  it('la X cierra el recorrido desde cualquier slide', () => {
    const { host, cerrados } = montarMovil();
    (host.querySelector('.welcome-close') as HTMLButtonElement).click();
    expect(cerrados.length).toBe(1);
  });
});
