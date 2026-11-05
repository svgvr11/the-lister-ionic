import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';

@Component({
  selector: 'app-close-button',
  standalone: true,
  imports: [IonIcon, IonRippleEffect],
  templateUrl: './close-button.component.html',
  styleUrls: ['./close-button.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CloseButtonComponent {
  /** Texto de aria-label y title. */
  @Input() label = 'Cerrar';
  /** Deshabilita el botón (opacidad, cursor not-allowed, sin clic). */
  @Input() disabled = false;
  /** Se emite al hacer clic (si no está deshabilitado). Renombrado de `click` para no colisionar con el evento DOM nativo del botón interno y evitar doble ejecución. */
  @Output() readonly activated = new EventEmitter<void>();

  @ViewChild('btn', { read: ElementRef }) private readonly btn?: ElementRef<HTMLButtonElement>;

  /** Elemento nativo del botón, para devolverle el foco desde el componente dueño. */
  get nativeElement(): HTMLElement | null {
    return this.btn?.nativeElement ?? null;
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
