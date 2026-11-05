import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CloseButtonComponent } from './close-button.component';
import { Component } from '@angular/core';

@Component({
  template: `<app-close-button (activated)="onActivated()"></app-close-button>`,
  standalone: true,
  imports: [CloseButtonComponent],
})
class HostTestComponent {
  activations = 0;
  onActivated(): void {
    this.activations++;
  }
}

function montar(props: Partial<CloseButtonComponent> = {}): {
  fixture: ComponentFixture<CloseButtonComponent>;
  component: CloseButtonComponent;
  host: HTMLElement;
  btn: HTMLButtonElement;
} {
  const fixture = TestBed.createComponent(CloseButtonComponent);
  Object.assign(fixture.componentInstance, props);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const btn = host.querySelector('.close-button') as HTMLButtonElement;
  return { fixture, component: fixture.componentInstance, host, btn };
}

function montarConHost(): {
  fixture: ComponentFixture<HostTestComponent>;
  host: HostTestComponent;
  btn: HTMLButtonElement;
} {
  const fixture = TestBed.createComponent(HostTestComponent);
  fixture.detectChanges();
  const host = fixture.componentInstance;
  const btn = fixture.nativeElement.querySelector('.close-button') as HTMLButtonElement;
  return { fixture, host, btn };
}

describe('close-button: renderizado por inputs', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('aplica label, title, aria-label por defecto', () => {
    const { component, host, btn } = montar({ label: 'Cerrar editor' });
    expect(component.label).toBe('Cerrar editor');
    expect(btn.getAttribute('aria-label')).toBe('Cerrar editor');
    expect(btn.getAttribute('title')).toBe('Cerrar editor');
    expect(host.querySelector('.close-button')).not.toBeNull();
  });

  it('label por defecto es Cerrar', () => {
    const { btn } = montar({});
    expect(btn.getAttribute('aria-label')).toBe('Cerrar');
  });

  it('icon es solo un input (no se valida renderizado de ion-icon en jsdom)', () => {
    const { component } = montar({});
    expect(component.label).toBe('Cerrar');
  });
});

describe('close-button: estados y accesibilidad', () => {
  it('deshabilitado pone disabled y no emite activated', () => {
    const { component, btn, fixture } = montar({ disabled: true });
    expect(btn.disabled).toBe(true);
    let emitido = false;
    component.activated.subscribe(() => (emitido = true));
    btn.click();
    fixture.detectChanges();
    expect(emitido).toBe(false);
  });

  it('habilitado emite activated', () => {
    const { component, btn } = montar({});
    let emitido = false;
    component.activated.subscribe(() => (emitido = true));
    btn.click();
    expect(emitido).toBe(true);
  });

  it('expone el elemento nativo y su método focus', () => {
    const { component, btn } = montar({ label: 'Cerrar' });
    expect(component.nativeElement).toBe(btn);
    const focusSpy = vi.spyOn(btn, 'focus');
    component.focus();
    expect(focusSpy).toHaveBeenCalled();
  });
});

describe('close-button: consumidor recibe un clic por activación', () => {
  it('un clic emite el output exactamente una vez (sin doble ejecución)', () => {
    const { component, btn, fixture } = montar({ label: 'Cerrar' });
    let emisiones = 0;
    component.activated.subscribe(() => emisiones++);
    btn.click();
    fixture.detectChanges();
    expect(emisiones).toBe(1);
  });

  it('dos clics emiten el output exactamente dos veces', () => {
    const { component, btn, fixture } = montar({ label: 'Cerrar' });
    let emisiones = 0;
    component.activated.subscribe(() => emisiones++);
    btn.click();
    fixture.detectChanges();
    btn.click();
    fixture.detectChanges();
    expect(emisiones).toBe(2);
  });
});
