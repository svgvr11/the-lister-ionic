import { beforeEach, describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TextFieldComponent } from './text-field.component';
import { Component } from '@angular/core';

@Component({
  template: `<app-text-field [(value)]="value" (enter)="onEnter()"></app-text-field>`,
  standalone: true,
  imports: [TextFieldComponent],
})
class HostTestComponent {
  value = '';
  enters = 0;
  onEnter(): void {
    this.enters++;
  }
}

function montar(props: Partial<TextFieldComponent> = {}): {
  fixture: ComponentFixture<TextFieldComponent>;
  component: TextFieldComponent;
  host: HTMLElement;
  labelEl: HTMLElement | null;
  field: HTMLElement | null;
  counter: HTMLElement | null;
  errorEl: HTMLElement | null;
} {
  const fixture = TestBed.createComponent(TextFieldComponent);
  Object.assign(fixture.componentInstance, props);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    component: fixture.componentInstance,
    host,
    labelEl: host.querySelector('.text-field-label'),
    field: host.querySelector('.text-field'),
    counter: host.querySelector('.char-count'),
    errorEl: host.querySelector('.text-field-error'),
  };
}

function montarConHost(): {
  fixture: ComponentFixture<HostTestComponent>;
  host: HostTestComponent;
} {
  const fixture = TestBed.createComponent(HostTestComponent);
  fixture.detectChanges();
  const host = fixture.componentInstance;
  return { fixture, host };
}

function despacharInput(fixture: ComponentFixture<TextFieldComponent>, value: string): void {
  const input = fixture.nativeElement.querySelector('input');
  if (input) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    (fixture.componentInstance as TextFieldComponent).onInput(new Event('input') as any);
  }
  fixture.detectChanges();
}

describe('text-field: renderizado por inputs', () => {
  it('renderiza etiqueta, campo y error según inputs; el contador se activa con showCounter', () => {
    const { fixture, component, host, labelEl, field, errorEl } = montar({
      label: 'Nombre de la lista',
      error: 'Campo obligatorio',
    });
    fixture.componentRef.setInput('showCounter', true);
    fixture.componentRef.setInput('counterMax', 70);
    fixture.detectChanges();
    expect(component.label).toBe('Nombre de la lista');
    expect(labelEl?.textContent).toBe('Nombre de la lista');
    expect(field).not.toBeNull();
    expect(component.showCounter).toBe(true);
    expect(component.counterMax).toBe(70);
    expect(component.atLimit).toBe(false);
    expect(errorEl?.textContent).toBe('Campo obligatorio');
    expect(field?.classList.contains('has-error')).toBe(true);
  });

  it('no renderiza etiqueta ni contador ni error cuando están vacíos', () => {
    const { labelEl, counter, errorEl } = montar({});
    expect(labelEl).toBeNull();
    expect(counter).toBeNull();
    expect(errorEl).toBeNull();
  });

  it('exposición de inputs: maxlength, disabled, placeholder', () => {
    const { component } = montar({ maxlength: 50, disabled: true, placeholder: 'Escribe...' });
    expect(component.maxlength).toBe(50);
    expect(component.disabled).toBe(true);
    expect(component.placeholder).toBe('Escribe...');
  });
});

describe('text-field: estado y eventos', () => {
  it('emite valueChange al escribir y actualiza contador', () => {
    const { fixture, component } = montar({ label: 'X' });
    fixture.componentRef.setInput('showCounter', true);
    fixture.componentRef.setInput('counterMax', 10);
    fixture.detectChanges();
    despacharInput(fixture, 'hola');
    expect(component.value).toBe('hola');
    expect(component.charCount).toBe(4);
    expect(component.atLimit).toBe(false);
  });

  it('enter emite el evento original', () => {
    const { component, fixture } = montar({ label: 'X' });
    const input = fixture.nativeElement.querySelector('input');
    const ev = new KeyboardEvent('keyup', { key: 'Enter' });
    let emitido: Event | null = null;
    component.enter.subscribe((e) => (emitido = e));
    if (input) {
      input.dispatchEvent(ev);
    }
    expect(emitido).toBe(ev);
  });

  it('paste emite el evento original', () => {
    const { component, fixture } = montar({ label: 'X' });
    const input = fixture.nativeElement.querySelector('input');
    const ev = new Event('paste');
    let emitido: Event | null = null;
    component.pasteFired.subscribe((e) => (emitido = e));
    if (input) {
      input.dispatchEvent(ev);
    }
    expect(emitido).toBe(ev);
  });

  it('focus y blur alternan focused y emiten focusFired/blurFired', () => {
    const { component, fixture } = montar({ label: 'X' });
    const input = fixture.nativeElement.querySelector('input');
    let focusFired = 0;
    let blurFired = 0;
    component.focusFired.subscribe(() => focusFired++);
    component.blurFired.subscribe(() => blurFired++);
    if (input) {
      input.dispatchEvent(new Event('focus', { bubbles: true }));
    }
    fixture.detectChanges();
    expect(component.focused).toBe(true);
    expect(focusFired).toBe(1);
    if (input) {
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    fixture.detectChanges();
    expect(component.focused).toBe(false);
    expect(blurFired).toBe(1);
  });

  it('atLimit es true al alcanzar el límite del contador', () => {
    const { component } = montar({ value: 'abcde', counterMax: 5 });
    expect(component.atLimit).toBe(true);
    expect(component.charCount).toBe(5);
  });
});

describe('text-field: consumidor recibe valor y enter', () => {
  it('[(value)] se actualiza al escribir', () => {
    const { fixture, host } = montarConHost();
    despacharInput(fixture as unknown as ComponentFixture<TextFieldComponent>, 'nuevo');
    expect(host.value).toBe('nuevo');
  });

  it('enter invoca al output exactamente una vez', () => {
    const { component, fixture } = montar({ label: 'X' });
    const input = fixture.nativeElement.querySelector('input');
    let emisiones = 0;
    component.enter.subscribe(() => emisiones++);
    if (input) {
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
    }
    fixture.detectChanges();
    expect(emisiones).toBe(1);
  });
});
