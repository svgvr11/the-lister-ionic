import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActionButtonComponent } from './action-button.component';
import { Component } from '@angular/core';

@Component({
  template: `<app-action-button (activated)="onActivated()"></app-action-button>`,
  standalone: true,
  imports: [ActionButtonComponent],
})
class HostTestComponent {
  activations = 0;
  onActivated(): void {
    this.activations++;
  }
}

function montar(props: Partial<ActionButtonComponent> = {}): {
  fixture: ComponentFixture<ActionButtonComponent>;
  component: ActionButtonComponent;
  host: HTMLElement;
  btn: HTMLButtonElement;
} {
  const fixture = TestBed.createComponent(ActionButtonComponent);
  Object.assign(fixture.componentInstance, props);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const btn = host.querySelector('.action-button') as HTMLButtonElement;
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
  const btn = fixture.nativeElement.querySelector('.action-button') as HTMLButtonElement;
  return { fixture, host, btn };
}

describe('action-button: renderizado por inputs', () => {
  it('aplica variant, disabled, label, title, type y clase de variante', () => {
    const { component, host, btn } = montar({
      variant: 'danger',
      disabled: false,
      label: 'Eliminar',
      type: 'button',
    });
    expect(component.variant).toBe('danger');
    expect(btn.getAttribute('aria-label')).toBe('Eliminar');
    expect(btn.getAttribute('title')).toBe('Eliminar');
    expect(btn.getAttribute('type')).toBe('button');
    expect(host.querySelector('.action-button--danger')).not.toBeNull();
  });

  it('aplica variant secondary y primary por defecto', () => {
    const { host: h1 } = montar({ variant: 'secondary' });
    expect(h1.querySelector('.action-button--secondary')).not.toBeNull();
    const { host: h2 } = montar({});
    expect(h2.querySelector('.action-button--primary')).not.toBeNull();
  });

  it('icon es solo un input (no se valida renderizado de ion-icon en jsdom)', () => {
    const { component } = montar({ icon: 'trash', iconPosition: 'end' });
    expect(component.icon).toBe('trash');
    expect(component.iconPosition).toBe('end');
  });
});

describe('action-button: estados y accesibilidad', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('deshabilitado pone disabled y no emite activated', () => {
    const { component, btn, fixture } = montar({ disabled: true, label: 'Guardar lista' });
    expect(btn.disabled).toBe(true);
    let emitido = false;
    component.activated.subscribe(() => (emitido = true));
    btn.click();
    fixture.detectChanges();
    expect(emitido).toBe(false);
  });

  it('habilitado emite activated', () => {
    const { component, btn } = montar({ label: 'Crear lista' });
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

describe('action-button: consumidor recibe un clic por activación', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('un clic emite el output exactamente una vez (sin doble ejecución)', () => {
    const { component, btn, fixture } = montar({ label: 'Crear lista' });
    let emisiones = 0;
    component.activated.subscribe(() => emisiones++);
    btn.click();
    fixture.detectChanges();
    expect(emisiones).toBe(1);
  });

  it('dos clics emiten el output exactamente dos veces', () => {
    const { component, btn, fixture } = montar({ label: 'Crear lista' });
    let emisiones = 0;
    component.activated.subscribe(() => emisiones++);
    btn.click();
    fixture.detectChanges();
    btn.click();
    fixture.detectChanges();
    expect(emisiones).toBe(2);
  });

  it('variant primary: un clic emite activated exactamente una vez', () => {
    const { component, btn, fixture } = montar({ variant: 'primary', label: 'Crear lista' });
    let emisiones = 0;
    component.activated.subscribe(() => emisiones++);
    btn.click();
    fixture.detectChanges();
    expect(emisiones).toBe(1);
  });
});
