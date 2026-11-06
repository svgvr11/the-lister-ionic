import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { attachOutline, close, downloadOutline, listOutline } from 'ionicons/icons';
import { BoardNote, BoardNoteAttachment } from '../../../models/board.model';
import { TextFieldComponent } from '../text-field/text-field.component';

/**
 * Contenido del editor de nota. Solo compone y emite acciones: la persistencia (subida,
 * descarga, borrado de adjuntos, guardado, descarte) vive en `pages/notes`.
 */
@Component({
  selector: 'app-note-editor-content',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect, TextFieldComponent],
  templateUrl: './note-editor-content.component.html',
  styleUrls: ['./note-editor-content.component.scss']
})
export class NoteEditorContentComponent {
  @Input() draft: BoardNote | null = null;
  @Input() editingExistingNote = false;
  @Input() editorBusy = false;
  @Input() attachmentUrls: Record<string, string> = {};

  @Output() readonly titleChange = new EventEmitter<string>();
  @Output() readonly editorInput = new EventEmitter<Event>();
  @Output() readonly format = new EventEmitter<'bold' | 'italic' | 'insertUnorderedList'>();
  @Output() readonly addAttachments = new EventEmitter<Event>();
  @Output() readonly removeAttachment = new EventEmitter<BoardNoteAttachment>();
  @Output() readonly downloadAttachment = new EventEmitter<BoardNoteAttachment>();

  constructor(readonly sanitizer: DomSanitizer) {
    addIcons({ attachOutline, close, downloadOutline, listOutline });
  }

  sanitizedHtml(html: string): string {
    return this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
  }

  onTitleInput(value: string): void {
    this.titleChange.emit(value);
  }

  onEditorInput(event: Event): void {
    this.editorInput.emit(event);
  }

  formatCommand(command: 'bold' | 'italic' | 'insertUnorderedList'): void {
    this.format.emit(command);
  }

  onAddAttachments(event: Event): void {
    this.addAttachments.emit(event);
  }

  onRemoveAttachment(attachment: BoardNoteAttachment): void {
    this.removeAttachment.emit(attachment);
  }

  onDownloadAttachment(attachment: BoardNoteAttachment): void {
    this.downloadAttachment.emit(attachment);
  }

  isImage(attachment: BoardNoteAttachment): boolean {
    return attachment.mimeType.startsWith('image/');
  }
}
