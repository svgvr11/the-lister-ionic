import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

let nextTextFieldId = 0;

@Component({
  selector: 'app-text-field',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './text-field.component.html',
  styleUrls: ['./text-field.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextFieldComponent {
  /** Etiqueta visible del campo. */
  @Input() label = '';
  /** Valor del campo (vinculable con [(value)]). */
  @Input() value = '';
  /** Texto de placeholder. */
  @Input() placeholder = '';
  /** Longitud máxima de caracteres. */
  @Input() maxlength?: number;
  /** Deshabilita el campo. */
  @Input() disabled = false;
  /** Mensaje de error mostrado debajo del campo. */
  @Input() error = '';
  /** Muestra el contador de caracteres. */
  @Input() showCounter = false;
  /** Límite del contador (se resalta al llegar). */
  @Input() counterMax?: number;
  /** autocapitalize del input. */
  @Input() autocapitalize = 'sentences';
  /** id del input (si se omite se genera automáticamente). */
  @Input() inputId = '';

  /** Se emite al cambiar el valor. */
  @Output() readonly valueChange = new EventEmitter<string>();
  /** Se emite al presionar Enter (con el evento original; `enter` no es un evento DOM nativo). */
  @Output() readonly enter = new EventEmitter<Event>();
  /** Se emite al pegar (con el evento original). Renombrado de `paste` para no colisionar con el evento DOM nativo. */
  @Output() readonly pasteFired = new EventEmitter<Event>();
  /** Se emite al recibir el foco. Renombrado de `focus` para no colisionar con el evento DOM nativo. */
  @Output() readonly focusFired = new EventEmitter<void>();
  /** Se emite al perder el foco. Renombrado de `blur` para no colisionar con el evento DOM nativo. */
  @Output() readonly blurFired = new EventEmitter<void>();

  @ViewChild('input', { read: ElementRef }) private readonly inputEl?: ElementRef<HTMLInputElement>;

  focused = false;

  /** id del input interno (único por instancia). */
  get resolvedInputId(): string {
    return this.inputId || `text-field-${++nextTextFieldId}`;
  }

  /** Indica si se ha llegado al límite del contador. */
  get atLimit(): boolean {
    return this.counterMax != null && this.value.length >= this.counterMax;
  }

  /** Número de caracteres actuales. */
  get charCount(): number {
    return this.value.length;
  }

  /** Da el foco al input nativo. */
  focusInput(): void {
    this.inputEl?.nativeElement?.focus();
  }

  onInput(event: Event): void {
    this.value = (event.target as HTMLInputElement).value;
    this.valueChange.emit(this.value);
  }

  onEnter(event: Event): void {
    this.enter.emit(event);
  }

  onPaste(event: Event): void {
    this.pasteFired.emit(event);
  }

  onFocus(): void {
    this.focused = true;
    this.focusFired.emit();
  }

  onBlur(): void {
    this.focused = false;
    this.blurFired.emit();
  }
}
