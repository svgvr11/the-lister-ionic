import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';

@Component({
  selector: 'app-action-button',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect],
  templateUrl: './action-button.component.html',
  styleUrls: ['./action-button.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionButtonComponent {
  /** Variante visual: primario (fondo de tema), secundario (transparente) o peligro (rojo). */
  @Input() variant: 'primary' | 'secondary' | 'danger' = 'primary';
  /** Deshabilita el botón (opacidad, cursor not-allowed, sin ripple ni clic). */
  @Input() disabled = false;
  /** Nombre del ícono de IonIcons (opcional). */
  @Input() icon = '';
  /** Posición del ícono respecto del contenido proyectado. */
  @Input() iconPosition: 'start' | 'end' = 'start';
  /** Texto de aria-label y title. */
  @Input() label = '';
  /** Tipo nativo del botón. */
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
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
