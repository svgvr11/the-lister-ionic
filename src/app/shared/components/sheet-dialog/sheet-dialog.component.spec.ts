import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BOARD_THEMES, type BoardTheme } from '../../../core/board/board-themes/board-themes';
import { OverlayStackService } from '../../../services/overlay-stack.service';
import { SheetDialogComponent } from './sheet-dialog.component';

addIcons({ close });

@Component({
  standalone: true,
  imports: [CommonModule, SheetDialogComponent],
  template: `
    <button #openerBtn type="button" class="opener">Abrir</button>
    <app-sheet-dialog
      *ngIf="open"
      [size]="size"
      [dismissible]="dismissible"
      [backdropDismissible]="backdropDismissible"
      [mobile]="mobile"
      [theme]="theme"
      [opener]="openerBtn"
      labelledBy="test-sheet-title"
      (closed)="onClosed()"
      (backdropClick)="onBackdropClick()"
    >
      <h2 sheet-title id="test-sheet-title">Título de prueba</h2>
      <button sheet-header-actions type="button" class="header-action">Acción</button>
      <input *ngIf="bodyFocusable" class="body-input" />
      <button sheet-footer type="button" class="footer-button">Guardar</button>
    </app-sheet-dialog>
  `
})
class SheetDialogHostComponent {
  open = true;
  size: 'sm' | 'md' = 'md';
  dismissible = true;
  backdropDismissible = true;
  mobile: boolean | null = false;
  theme: BoardTheme | null = null;
  bodyFocusable = true;
  closedCount = 0;
  backdropClickCount = 0;

  onClosed(): void {
    this.closedCount++;
    this.open = false;
  }

  onBackdropClick(): void {
    this.backdropClickCount++;
    this.open = false;
  }
}

const delay = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function sheetElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.sheet-dialog');
}

function backdropElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.cdk-overlay-backdrop.sheet-dialog-backdrop');
}

describe('sheet-dialog: apertura, slots y cierre', () => {
  let fixture: ComponentFixture<SheetDialogHostComponent>;
  let host: SheetDialogHostComponent;

  beforeEach(() => {
    fixture = TestBed.createComponent(SheetDialogHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  const sheet = (): SheetDialogComponent =>
    fixture.debugElement.query(By.directive(SheetDialogComponent)).componentInstance;

  it('se abre portado al body, con rol de diálogo y los slots proyectados', () => {
    const root = sheetElement();
    expect(root).not.toBeNull();
    expect(root?.closest('.cdk-overlay-container')).not.toBeNull();
    expect(root?.closest('.sheet-dialog-pane')).not.toBeNull();
    expect(root?.getAttribute('role')).toBe('dialog');
    expect(root?.getAttribute('aria-modal')).toBe('true');
    expect(root?.getAttribute('aria-labelledby')).toBe('test-sheet-title');
    expect(document.querySelector('#test-sheet-title')?.textContent).toContain('Título de prueba');
    expect(document.querySelector('.sheet-dialog__header-actions .header-action')).not.toBeNull();
    expect(document.querySelector('.sheet-dialog__body .body-input')).not.toBeNull();
    expect(document.querySelector('.sheet-dialog__footer .footer-button')).not.toBeNull();
  });

  it('el botón de cerrar compartido emite closed y el padre desmonta el overlay', () => {
    const overlayId = sheet().overlayId;
    expect(overlayId).toContain('sheet-dialog:');
    const close = document.querySelector<HTMLButtonElement>('.sheet-dialog .close-button');
    expect(close).not.toBeNull();
    close?.click();
    expect(host.closedCount).toBe(1);
    fixture.detectChanges();
    expect(sheetElement()).toBeNull();
  });

  it('el backdrop es propio del sheet', () => {
    const backdrop = backdropElement();
    expect(backdrop).not.toBeNull();
    expect(backdrop?.classList.contains('cdk-overlay-backdrop')).toBe(true);
  });
});

describe('sheet-dialog: tamaño y modo móvil', () => {
  let fixture: ComponentFixture<SheetDialogHostComponent>;
  let host: SheetDialogHostComponent;

  beforeEach(() => {
    fixture = TestBed.createComponent(SheetDialogHostComponent);
    host = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('aplica la clase de tamaño sm', () => {
    host.size = 'sm';
    fixture.detectChanges();
    expect(sheetElement()?.classList.contains('sheet-dialog--sm')).toBe(true);
    expect(sheetElement()?.classList.contains('sheet-dialog--md')).toBe(false);
  });

  it('aplica la clase de tamaño md por defecto', () => {
    fixture.detectChanges();
    expect(sheetElement()?.classList.contains('sheet-dialog--md')).toBe(true);
  });

  it('móvil añade el asa y la variante de bottom sheet', () => {
    host.mobile = true;
    fixture.detectChanges();
    expect(sheetElement()?.classList.contains('sheet-dialog--mobile')).toBe(true);
    expect(sheetElement()?.querySelector('.sheet-dialog__handle')).not.toBeNull();
  });

  it('la variante móvil se captura al abrir y no cambia en vivo', () => {
    host.mobile = false;
    fixture.detectChanges();
    expect(sheetElement()?.classList.contains('sheet-dialog--mobile')).toBe(false);
    host.mobile = true;
    fixture.detectChanges();
    expect(sheetElement()?.classList.contains('sheet-dialog--mobile')).toBe(false);
    expect(sheetElement()?.querySelector('.sheet-dialog__handle')).toBeNull();
  });
});

describe('sheet-dialog: pila de overlays y dismissible', () => {
  let fixture: ComponentFixture<SheetDialogHostComponent>;
  let host: SheetDialogHostComponent;
  let stack: OverlayStackService;

  beforeEach(() => {
    stack = TestBed.inject(OverlayStackService);
    stack.sync('board', [{ id: 'board:inline-edit', close: () => undefined }]);
    fixture = TestBed.createComponent(SheetDialogHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    stack.unregisterOwner('board');
    TestBed.resetTestingModule();
  });

  const sheet = (): SheetDialogComponent =>
    fixture.debugElement.query(By.directive(SheetDialogComponent)).componentInstance;

  it('se auto-registra por encima de las entradas que board reescribe en cada ngDoCheck', () => {
    expect(stack.topId).toBe(sheet().overlayId);

    // board.page vuelve a sincronizar la misma lista en cada ngDoCheck.
    stack.sync('board', [{ id: 'board:inline-edit', close: () => undefined }]);
    expect(stack.topId).toBe(sheet().overlayId);
  });

  it('closeTop saca la entrada antes de llamar a close y el sheet se desmonta sin doble baja', () => {
    expect(stack.closeTop()).toBe('closed');
    expect(host.closedCount).toBe(1);
    fixture.detectChanges();
    expect(sheetElement()).toBeNull();
    expect(stack.topId).toBe('board:inline-edit');
  });

  it('dismissible=false bloquea Atrás/Escape; al activarlo se puede cerrar', () => {
    host.dismissible = false;
    fixture.detectChanges();
    expect(stack.closeTop()).toBe('blocked');
    expect(host.closedCount).toBe(0);
    expect(sheetElement()).not.toBeNull();

    host.dismissible = true;
    fixture.detectChanges();
    expect(stack.closeTop()).toBe('closed');
    expect(host.closedCount).toBe(1);
    fixture.detectChanges();
    expect(sheetElement()).toBeNull();
  });
});

describe('sheet-dialog: Escape y backdrop', () => {
  let fixture: ComponentFixture<SheetDialogHostComponent>;
  let host: SheetDialogHostComponent;

  beforeEach(() => {
    fixture = TestBed.createComponent(SheetDialogHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('Escape cierra cuando es descartable', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true
    }));
    expect(host.closedCount).toBe(1);
    fixture.detectChanges();
    expect(sheetElement()).toBeNull();
  });

  it('Escape no cierra cuando hay una operación en curso', () => {
    host.dismissible = false;
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true
    }));
    expect(host.closedCount).toBe(0);
    expect(sheetElement()).not.toBeNull();
  });

  it('el backdrop solo cierra si es descartable', () => {
    host.dismissible = false;
    fixture.detectChanges();
    backdropElement()?.click();
    expect(host.closedCount).toBe(0);
    expect(host.backdropClickCount).toBe(0);

    host.dismissible = true;
    fixture.detectChanges();
    backdropElement()?.click();
    fixture.detectChanges();
    expect(host.backdropClickCount).toBe(1);
    expect(host.closedCount).toBe(0);
    expect(sheetElement()).toBeNull();
  });

  it('backdropDismissible=false protege el fondo, pero Escape sigue cerrando', () => {
    host.backdropDismissible = false;
    fixture.detectChanges();
    backdropElement()?.click();
    expect(host.closedCount).toBe(0);
    expect(sheetElement()).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true
    }));
    expect(host.closedCount).toBe(1);
    fixture.detectChanges();
    expect(sheetElement()).toBeNull();
  });
});

describe('sheet-dialog: foco', () => {
  let fixture: ComponentFixture<SheetDialogHostComponent>;
  let host: SheetDialogHostComponent;

  beforeEach(() => {
    fixture = TestBed.createComponent(SheetDialogHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('enfoca el primer control del cuerpo tras la animación y devuelve el foco al opener', async () => {
    await delay(260);
    const input = document.querySelector<HTMLInputElement>('.body-input');
    expect(document.activeElement).toBe(input);

    host.open = false;
    fixture.detectChanges();
    await delay(10);
    expect(document.activeElement).toBe(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.opener')
    );
  });

  it('si el cuerpo no tiene controles enfoca el contenedor del diálogo', async () => {
    fixture.destroy();
    fixture = TestBed.createComponent(SheetDialogHostComponent);
    host = fixture.componentInstance;
    host.bodyFocusable = false;
    fixture.detectChanges();
    await delay(260);
    expect(document.activeElement).toBe(sheetElement());
  });

  it('atrapa Tab en el primer y el último control', async () => {
    await delay(260);
    const headerAction = document.querySelector<HTMLButtonElement>('.header-action');
    const footerButton = document.querySelector<HTMLButtonElement>('.footer-button');
    expect(headerAction).not.toBeNull();
    expect(footerButton).not.toBeNull();

    footerButton!.focus();
    footerButton!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true
    }));
    expect(document.activeElement).toBe(headerAction);

    headerAction!.focus();
    headerAction!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true
    }));
    expect(document.activeElement).toBe(footerButton);
  });
});

describe('sheet-dialog: variables de tema bajo el portal', () => {
  let fixture: ComponentFixture<SheetDialogHostComponent>;
  let host: SheetDialogHostComponent;

  beforeEach(() => {
    fixture = TestBed.createComponent(SheetDialogHostComponent);
    host = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('aplica el mapa del tema en la raíz portada', () => {
    const theme = BOARD_THEMES[0];
    host.theme = theme;
    fixture.detectChanges();
    const root = sheetElement();
    expect(root).not.toBeNull();
    expect(root?.style.getPropertyValue('--accent')).toBe(theme.accent);
    expect(root?.style.getPropertyValue('--board-bg')).toBe(theme.background);
    expect(root?.style.getPropertyValue('--topbar-bg')).toBe(theme.toolbar);
    expect(root?.style.getPropertyValue('--fab-color')).toBe(theme.fab);
    expect(root?.style.getPropertyValue('--fab-hover')).toBe(theme.accent);
    expect(root?.style.getPropertyValue('--card-surface')).toBe('#fff');
    expect(root?.style.getPropertyValue('--focus-muted-text')).toBe(
      `color-mix(in srgb, ${theme.accent} 60%, transparent)`
    );
  });

  it('actualiza las variables si el tema cambia con el sheet abierto', () => {
    host.theme = BOARD_THEMES[0];
    fixture.detectChanges();
    host.theme = BOARD_THEMES[1];
    fixture.detectChanges();
    expect(sheetElement()?.style.getPropertyValue('--accent')).toBe(BOARD_THEMES[1].accent);
  });
});
