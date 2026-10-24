import { Component, EventEmitter, Input, Output, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonInput, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { add, returnDownBack } from 'ionicons/icons';

@Component({
  selector: 'app-add-task-input',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon, IonInput, IonRippleEffect],
  templateUrl: './add-task-input.component.html',
  styleUrls: ['./add-task-input.component.scss'],
})
export class AddTaskInputComponent {
  @Input() value: string | null | undefined = '';
  @Output() valueChange = new EventEmitter<string>();
  @Input() placeholder = '';
  @Output() submitted = new EventEmitter<string>();

  @ViewChild('input') private input?: ElementRef<HTMLInputElement>;

  constructor() {
    addIcons({ add, returnDownBack });
  }

  get normalizedValue(): string {
    return this.value ?? '';
  }

  onValueChange(val: string | null | undefined): void {
    this.valueChange.emit(val ?? '');
  }

  onKeyDown(event: Event): void {
    if ((event as KeyboardEvent).key !== 'Enter') return;
    event.preventDefault();
    this.trySubmit();
  }

  onClick(): void {
    this.trySubmit();
  }

  private trySubmit(): void {
    const text = (this.value ?? '').trim();
    if (!text) return;
    this.submitted.emit(text);
    // mantener foco
    requestAnimationFrame(() => {
      const el = this.input?.nativeElement as any;
      el?.setFocus?.();
      el?.focus?.();
    });
  }
}
