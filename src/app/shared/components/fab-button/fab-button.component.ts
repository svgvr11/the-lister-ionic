import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';

@Component({
  selector: 'app-fab-button',
  standalone: true,
  imports: [IonIcon, IonRippleEffect],
  templateUrl: './fab-button.component.html',
  styleUrls: ['./fab-button.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FabButtonComponent {
  /** Ícono de IonIcons a mostrar (p. ej. 'add' o 'close'). Lo decide el padre según su estado abierto. */
  @Input() icon = 'add';
  /** Estado abierto: rota el ícono, expande aria-expanded y aplica clase .open. */
  @Input() open = false;
  /** Deshabilita el botón (opacidad, cursor not-allowed, sin animación). */
  @Input() disabled = false;
  /** Texto de aria-label y title. */
  @Input() label = '';
  /** Valor de aria-haspopup. */
  @Input() haspopup = 'dialog';
  /** Variante móvil (54 px) forzada; por defecto se resuelve por @media (max-width: 480px). */
  @Input() mobile = false;
  /** Se emite al hacer clic (si no está deshabilitado). Renombrado de `click` para no
   colisionar con el evento DOM nativo del botón interno y evitar doble ejecución. */
  @Output() readonly activated = new EventEmitter<void>();

  @ViewChild('fabBtn', { read: ElementRef }) private readonly fabBtn?: ElementRef<HTMLButtonElement>;

  /** Elemento nativo del botón, para devolverle el foco desde el componente dueño. */
  get nativeElement(): HTMLElement | null {
    return this.fabBtn?.nativeElement ?? null;
  }

  /** Da el foco al botón nativo. */
  focus(): void {
    this.nativeElement?.focus();
  }

  onClick(): void {
    if (this.disabled) return;
    this.activated.emit();
  }
}
