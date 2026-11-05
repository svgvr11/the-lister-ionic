import { CommonModule, DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
  inject,
  output
} from '@angular/core';
import { Overlay, OverlayConfig, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { Subscription } from 'rxjs';
import type { BoardTheme } from '../../../core/board/board-themes/board-themes';
import { boardThemeVariables } from '../../../core/ui/theme-variables/theme-variables';
import { MobilePresentationService } from '../../../services/mobile-presentation.service';
import { OverlayStackService } from '../../../services/overlay-stack.service';
import { CloseButtonComponent } from '../close-button/close-button.component';

const FOCUS_DELAY_MS = 220;
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

let nextSheetId = 0;

/**
 * Sheet/diálogo compartido (T-004a).
 *
 * El componente vive en la plantilla del padre, pero su contenido se porta a
 * `document.body` con CDK Overlay para escapar del contexto de apilamiento de
 * `<ion-content>`. No conoce listas ni notas: recibe la cabecera, el cuerpo, el
 * pie y el divisor por proyección de contenido.
 *
 * - Escritorio: diálogo centrado. Móvil: bottom sheet con asa.
 * - La variante móvil se captura al abrir y no cambia si se redimensiona.
 * - Se auto-registra en `OverlayStackService`; `dismissible` se puede actualizar
 *   mientras está abierto (p. ej., una operación en curso).
 * - Escape/backdrop solo cierran si `dismissible`; el foco queda atrapado y vuelve
 *   al opener al desmontarse.
 */
@Component({
  selector: 'app-sheet-dialog',
  standalone: true,
  imports: [CommonModule, CloseButtonComponent],
  templateUrl: './sheet-dialog.component.html',
  styleUrls: ['./sheet-dialog.component.scss']
})
export class SheetDialogComponent implements AfterViewInit, OnChanges, OnDestroy, OnInit {
  /** Ancho del diálogo: `sm` (440 px, formularios) o `md` (680 px, foco). */
  @Input() size: 'sm' | 'md' = 'md';
  /** Si es false, Atrás/Escape/backdrop no cierran (operación en curso). */
  @Input() dismissible = true;
  /**
   * Si es false, el clic en el backdrop no cierra, pero Escape y el botón de cerrar sí.
   * Permite proteger cambios escritos sin bloquear las demás salidas.
   */
  @Input() backdropDismissible = true;
  /**
   * Variante móvil. Si no se pasa, se captura del servicio al abrir. Cualquier
   * cambio posterior del input se ignora a propósito: la variante no cambia en vivo.
   */
  @Input() mobile: boolean | null = null;
  /** Tema del tablero. Se aplica como variables CSS en la raíz del sheet (bajo el portal). */
  @Input() theme: BoardTheme | null = null;
  /** Elemento que abrió el sheet; recibe el foco al cerrar. Si falta, se usa document.activeElement. */
  @Input() opener: HTMLElement | null = null;
  /** Id del elemento que titula el diálogo. Si falta, se usa el contenedor del slot de título. */
  @Input() labelledBy = '';
  /** Muestra el botón de cerrar compartido (T-003). El modal de foco puede ocultarlo y usar sus acciones. */
  @Input() showCloseButton = true;
  @Input() closeLabel = 'Cerrar';
  /** Selector del primer elemento que recibe el foco; `dialog` enfoca la tarjeta. */
  @Input() initialFocusSelector = '';
  /** Devuelve el foco al opener al desmontarse. */
  @Input() restoreFocus = true;

  /** Se emite cuando el usuario pide cerrar (botón, Escape, backdrop) o lo pide la pila. */
  readonly closed = output<void>();
  /** Se emite solo al hacer clic en el backdrop (descarte directo del fondo). */
  readonly backdropClick = output<void>();

  /** Id único en la pila de overlays; expuesto para diagnóstico y pruebas. */
  readonly overlayId = `sheet-dialog:${++nextSheetId}`;
  readonly titleId = `sheet-dialog-title-${nextSheetId}`;

  @ViewChild('sheetTemplate', { static: true })
  private sheetTemplate!: TemplateRef<unknown>;

  private readonly overlay = inject(Overlay);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly overlays = inject(OverlayStackService);
  private readonly mobilePresentation = inject(MobilePresentationService);
  private readonly document = inject(DOCUMENT);

  private overlayRef: OverlayRef | null = null;
  private sheetRoot: HTMLElement | null = null;
  private openerElement: HTMLElement | null = null;
  /** Variante capturada al abrir; la plantilla la usa para el asa y el estilo de bottom sheet. */
  mobileMode = false;
  private initialFocusDone = false;
  private initialFocusTimer: ReturnType<typeof setTimeout> | null = null;
  private backdropSubscription: Subscription | null = null;
  private unregisterOverlay: (() => void) | null = null;
  private readonly appliedThemeProperties = new Set<string>();

  private readonly onDocumentKeydown = (event: KeyboardEvent): void => {
    if (!this.sheetRoot || event.defaultPrevented) return;
    // Solo el overlay superior cierra con Escape/Tab; los sheets debajo no lo tocan.
    if (this.overlays.topId !== this.overlayId) return;
    // Si el foco está dentro, el manejador del propio sheet decide en fase de burbuja
    // (así los controles internos pueden consumir Escape antes, p. ej. un tooltip).
    if (this.sheetRoot.contains(event.target as Node)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (this.dismissible) this.requestClose();
      return;
    }
    if (event.key === 'Tab') {
      const focusable = this.focusableElements();
      event.preventDefault();
      event.stopPropagation();
      const target = event.shiftKey
        ? focusable[focusable.length - 1]
        : focusable[0];
      (target ?? this.sheetRoot).focus();
    }
  };

  ngOnInit(): void {
    const active = this.document.activeElement;
    this.openerElement = this.opener
      ?? (active instanceof HTMLElement && active !== this.document.body ? active : null);
    this.mobileMode = this.mobile ?? this.mobilePresentation.snapshot();
    this.unregisterOverlay = this.overlays.register({
      id: this.overlayId,
      close: () => this.requestClose(),
      dismissible: this.dismissible
    });
  }

  ngAfterViewInit(): void {
    this.overlayRef = this.overlay.create(this.overlayConfig());
    const viewRef = this.overlayRef.attach(
      new TemplatePortal(this.sheetTemplate, this.viewContainerRef)
    );
    const root = viewRef.rootNodes.find(
      (node): node is HTMLElement =>
        node instanceof HTMLElement && node.classList.contains('sheet-dialog')
    ) ?? this.overlayRef.overlayElement.querySelector<HTMLElement>('.sheet-dialog');
    this.sheetRoot = root ?? null;

    this.applyThemeVariables();
    this.document.addEventListener('keydown', this.onDocumentKeydown, true);
    this.backdropSubscription = this.overlayRef.backdropClick().subscribe(() => {
      if (this.dismissible && this.backdropDismissible) this.backdropClick.emit();
    });
    this.initialFocusTimer = setTimeout(() => this.focusInitial(), FOCUS_DELAY_MS);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['dismissible'] && !changes['dismissible'].firstChange) {
      this.overlays.setDismissible(this.overlayId, this.dismissible);
    }
    if (changes['theme']) this.applyThemeVariables();
  }

  ngOnDestroy(): void {
    this.document.removeEventListener('keydown', this.onDocumentKeydown, true);
    if (this.initialFocusTimer !== null) clearTimeout(this.initialFocusTimer);
    this.initialFocusTimer = null;
    this.backdropSubscription?.unsubscribe();
    this.backdropSubscription = null;
    this.unregisterOverlay?.();
    this.unregisterOverlay = null;
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.sheetRoot = null;

    const opener = this.openerElement;
    this.openerElement = null;
    if (this.restoreFocus && opener?.isConnected) {
      setTimeout(() => {
        if (opener.isConnected) opener.focus();
      }, 0);
    }
  }

  /** El usuario pide cerrar; el padre decide si desmonta el sheet. */
  requestClose(): void {
    this.closed.emit();
  }

  /** Foco inicial tras la animación de entrada. Idempotente. */
  onAnimationEnd(event: AnimationEvent): void {
    if (event.target !== this.sheetRoot) return;
    if (!event.animationName.startsWith('sheetDialogEnter')) return;
    this.focusInitial();
  }

  /** Teclado dentro del sheet: Escape y trampa de Tab. */
  onSheetKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (this.dismissible) this.requestClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = this.focusableElements();
    if (!focusable.length) {
      event.preventDefault();
      this.sheetRoot?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const root = this.sheetRoot;
    const outside = !root?.contains(this.document.activeElement);
    if (event.shiftKey && (this.document.activeElement === first || outside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (this.document.activeElement === last || outside)) {
      event.preventDefault();
      first.focus();
    }
  }

  private overlayConfig(): OverlayConfig {
    const global = this.overlay.position().global();
    return {
      hasBackdrop: true,
      backdropClass: 'sheet-dialog-backdrop',
      panelClass: ['sheet-dialog-pane', this.mobileMode ? 'sheet-dialog-pane--mobile' : 'sheet-dialog-pane--desktop'],
      scrollStrategy: this.overlay.scrollStrategies.block(),
      positionStrategy: this.mobileMode
        ? global.bottom('0').left('0')
        : global.centerHorizontally().centerVertically(),
      width: this.mobileMode ? '100%' : undefined,
      maxWidth: '100%',
      maxHeight: '100%'
    };
  }

  private focusInitial(): void {
    if (this.initialFocusDone || !this.sheetRoot) return;
    this.initialFocusDone = true;
    const root = this.sheetRoot;
    if (this.initialFocusSelector === 'dialog') {
      root.focus();
      return;
    }
    if (this.initialFocusSelector) {
      const target = root.querySelector<HTMLElement>(this.initialFocusSelector);
      if (target) {
        target.focus();
        return;
      }
    }
    const body = root.querySelector<HTMLElement>('.sheet-dialog__body');
    const target = this.firstFocusable(body);
    (target ?? root).focus();
  }

  private focusableElements(): HTMLElement[] {
    return Array.from(this.sheetRoot?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])
      .filter((element) => !element.hasAttribute('inert')
        && element.getAttribute('aria-hidden') !== 'true'
        && !element.closest('[hidden]'));
  }

  private firstFocusable(container: Element | null): HTMLElement | null {
    return container?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? null;
  }

  private applyThemeVariables(): void {
    if (!this.sheetRoot) return;
    for (const name of this.appliedThemeProperties) {
      this.sheetRoot.style.removeProperty(name);
    }
    this.appliedThemeProperties.clear();
    if (!this.theme) return;
    for (const [name, value] of Object.entries(boardThemeVariables(this.theme))) {
      this.sheetRoot.style.setProperty(name, value);
      this.appliedThemeProperties.add(name);
    }
  }
}
