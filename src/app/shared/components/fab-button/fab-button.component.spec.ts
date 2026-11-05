import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FabButtonComponent } from './fab-button.component';
import { Component } from '@angular/core';

@Component({
  template: `<app-fab-button (activated)="onActivated()"></app-fab-button>`,
  standalone: true,
  imports: [FabButtonComponent],
})
class HostTestComponent {
  activations = 0;
  onActivated(): void {
    this.activations++;
  }
}

function montar(props: Partial<FabButtonComponent> = {}): {
  fixture: ComponentFixture<FabButtonComponent>;
  component: FabButtonComponent;
  host: HTMLElement;
  btn: HTMLButtonElement;
} {
  const fixture = TestBed.createComponent(FabButtonComponent);
  Object.assign(fixture.componentInstance, props);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const btn = host.querySelector('.fab-button') as HTMLButtonElement;
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
  const btn = fixture.nativeElement.querySelector('.fab-button') as HTMLButtonElement;
  return { fixture, host, btn };
}

describe('fab-button: renderizado por inputs', () => {
  it('aplica icono, estado abierto, aria-expanded, aria-has popup y label/title', () => {
    const { component, host, btn } = montar({
      icon: 'close',
      open: true,
      disabled: false,
      label: 'Nueva nota',
      haspopup: 'dialog',
    });
    expect(component.icon).toBe('close');
    expect(component.open).toBe(true);
    expect(btn.getAttribute('aria-label')).toBe('Nueva nota');
    expect(btn.getAttribute('title')).toBe('Nueva nota');
    expect(btn.getAttribute('aria-haspopup')).toBe('dialog');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.fab-button.open')).not.toBeNull();
  });

  it('aria-expanded es false cuando open es false', () => {
    const { btn } = montar({ open: false });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('aplica clase .mobile con el input mobile', () => {
    const { host } = montar({ mobile: true });
    expect(host.querySelector('.fab-button.mobile')).not.toBeNull();
  });
});

describe('fab-button: estados y accesibilidad', () => {
  it('deshabilitado pone disabled y no emite activated', () => {
    const { component, btn, fixture } = montar({ disabled: true, label: 'Añadir lista' });
    expect(btn.disabled).toBe(true);
    let emitido = false;
    component.activated.subscribe(() => (emitido = true));
    btn.click();
    fixture.detectChanges();
    expect(emitido).toBe(false);
  });

  it('habilitado emite activated al hacer clic', () => {
    const { component, btn } = montar({ label: 'Nueva nota' });
    let emitido = false;
    component.activated.subscribe(() => (emitido = true));
    btn.click();
    expect(emitido).toBe(true);
  });

  it('expone el elemento nativo y su método focus', () => {
    const { component, btn } = montar({ label: 'Añadir lista' });
    expect(component.nativeElement).toBe(btn);
    const focusSpy = vi.spyOn(btn, 'focus');
    component.focus();
    expect(focusSpy).toHaveBeenCalled();
  });
});

describe('fab-button: regresión — un clic invoca al consumidor una sola vez', () => {
  it('el output activated se dispara exactamente una vez por clic (sin doble ejecución)', () => {
    const { fixture, host, btn } = montarConHost();
    btn.click();
    fixture.detectChanges();
    expect(host.activations).toBe(1);
  });

  it('dos clics invocan al consumidor exactamente dos veces', () => {
    const { fixture, host, btn } = montarConHost();
    btn.click();
    fixture.detectChanges();
    btn.click();
    fixture.detectChanges();
    expect(host.activations).toBe(2);
  });
});
