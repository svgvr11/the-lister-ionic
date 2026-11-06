import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { BoardNote } from '../../../models/board.model';

/**
 * Tarjeta de nota. Solo compone: no persiste nada.
 *
 * Se parece a la tarjeta de lista en móvil: pin arriba a la izquierda y título debajo, con el
 * mismo tamaño de tipografía que una tarjeta de lista.
 *
 * Deja un hueco reservado para la agarradera de reordenamiento futura (T-008): solo el asa, sin
 * contador. El hueco ocupa su sitio sin dibujar nada, para que añadir el asa más adelante no
 * mueva los hermanos.
 */
@Component({
  selector: 'app-note-card',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect],
  templateUrl: './note-card.component.html',
  styleUrls: ['./note-card.component.scss']
})
export class NoteCardComponent {
  @Input() note!: BoardNote;
  @Input() pinned = false;
  @Input() compact = false;
  /** Pulso sobre la tarjeta: abre la nota en edición. */
  @Output() readonly cardClick = new EventEmitter<{ note: BoardNote; event: Event }>();
  /** Pulso sobre el pin: fija/desfija la nota. */
  @Output() readonly cardPinToggle = new EventEmitter<{ note: BoardNote; event: Event }>();

  onClick(event: Event): void {
    this.cardClick.emit({ note: this.note, event });
  }

  onPinToggle(event: Event): void {
    event.stopPropagation();
    this.cardPinToggle.emit({ note: this.note, event });
  }
}
