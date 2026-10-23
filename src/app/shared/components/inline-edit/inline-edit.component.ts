import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { editKeyAction, normalizePastedEditText, splitEditOnNewline } from '../../../core/inline-edit';

@Component({
  selector: 'app-inline-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon, IonRippleEffect],
  templateUrl: './inline-edit.component.html',
  styleUrls: ['./inline-edit.component.scss'],
})
export class InlineEditComponent implements AfterViewInit {
  @Input() variant: 'title' | 'task' = 'task';
  @Input() value = '';
  @Input() label = 'Editar tarea';
  @Input() fieldName = 'inline-edit';
  @Input() maxlength: number | null = null;
  @Input() showCount = false;
  @Input() count = 0;
  @Input() atLimit = false;
  @Input() saveDisabled = false;
  @Output() valueChange = new EventEmitter<string>();
  @Output() save = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() heightChange = new EventEmitter<void>();
  @ViewChild('area') private area?: ElementRef<HTMLTextAreaElement>;
  private lastHeight = 0;
  constructor(private readonly host: ElementRef<HTMLElement>) {}
  ngAfterViewInit(): void {
    requestAnimationFrame(() => {
      this.autosize();
      const el = this.area?.nativeElement;
      if (!el) return;
      el.focus();
      try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* noop */ }
      if (el.scrollIntoView) { try { el.scrollIntoView({ block: 'nearest' }); } catch { /* noop */ } }
    });
  }
  onInput(val: string): void {
    const split = splitEditOnNewline(val);
    if (split.hadNewline) {
      this.value = split.before;
      this.valueChange.emit(this.value);
      this.autosize();
      this.save.emit();
      return;
    }
    this.value = val;
    this.valueChange.emit(val);
    this.autosize();
  }
  onKeydown(event: KeyboardEvent): void {
    const action = editKeyAction({ key: event.key, shiftKey: event.shiftKey, isComposing: event.isComposing });
    if (action === 'cancel') { event.preventDefault(); event.stopPropagation(); this.cancel.emit(); return; }
    if (action === 'save') { event.preventDefault(); event.stopPropagation(); this.save.emit(); return; }
    if (action === 'ignore-newline') { event.preventDefault(); return; }
  }
  onBeforeInput(event: Event): void {
    const t = (event as InputEvent).inputType ?? '';
    if (t === 'insertLineBreak' || t === 'insertParagraph') {
      event.preventDefault();
      this.save.emit();
    }
  }
  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const raw = event.clipboardData?.getData('text') ?? '';
    const clean = normalizePastedEditText(raw);
    const el = this.area?.nativeElement;
    if (!el) { this.value = (this.value + ' ' + clean).trim(); this.valueChange.emit(this.value); this.autosize(); return; }
    const start = el.selectionStart ?? this.value.length;
    const end = el.selectionEnd ?? this.value.length;
    const next = (this.value.slice(0, start) + clean + this.value.slice(end));
    this.value = next;
    this.valueChange.emit(next);
    requestAnimationFrame(() => {
      try { const pos = start + clean.length; el.setSelectionRange(pos, pos); } catch { /* noop */ }
      this.autosize();
    });
  }
  autosize(): void {
    const el = this.area?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    const h = el.scrollHeight;
    el.style.height = h + 'px';
    // Alto real del campo (contenido + padding + borde): los botones de acción
    // se igualan a este valor con --inline-edit-h en lugar de crecer fijos a 40/44px.
    const box = el.offsetHeight;
    if (box > 0) this.host.nativeElement.style.setProperty('--inline-edit-h', `${box}px`);
    if (Math.abs(h - this.lastHeight) > 1) { this.lastHeight = h; this.heightChange.emit(); }
  }
}
