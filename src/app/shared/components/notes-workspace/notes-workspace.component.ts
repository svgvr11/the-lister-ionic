import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, QueryList, SecurityContext, ViewChild, ViewChildren, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { add, attachOutline, close, downloadOutline, imageOutline, listOutline, pin, pinOutline, trash } from 'ionicons/icons';
import { ActionButtonComponent } from '../action-button/action-button.component';
import { CloseButtonComponent } from '../close-button/close-button.component';
import { SheetDialogComponent } from '../sheet-dialog/sheet-dialog.component';
import { TextFieldComponent } from '../text-field/text-field.component';
import { BoardNote, BoardNoteAttachment } from '../../../models/board.model';
import { orderedNotes, setPinnedNote } from '../../../core/board/note-rules/note-rules';
import { MasonryController, MASONRY_GAP, resolveBoardFlowMode } from '../../../core/ui/masonry-layout/masonry-layout';
import { NoteAttachmentService } from '../../../services/note-attachment.service';
import { type BoardTheme } from '../../../core/board/board-themes/board-themes';
import { MobilePresentationService } from '../../../services/mobile-presentation.service';

@Component({
  selector: 'app-notes-workspace',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect, ActionButtonComponent, CloseButtonComponent, SheetDialogComponent, TextFieldComponent],
  templateUrl: './notes-workspace.component.html',
  styleUrls: ['./notes-workspace.component.scss']
})
export class NotesWorkspaceComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() notes: BoardNote[] = [];
  @Input() pinnedNoteId: string | null = null;
  @Input() boardId = '';
  @Input() isNative = false;
  @Input() compactCards = false;
  @Input() searchQuery = '';
  @Input() themeAccent = '#8870ad';
  /** Tema del tablero para aplicarlo al sheet del editor (bajo el portal). */
  @Input() theme: BoardTheme | null = null;
  @Output() notesChange = new EventEmitter<BoardNote[]>();
  @Output() pinnedNoteIdChange = new EventEmitter<string | null>();

  private readonly attachments = inject(NoteAttachmentService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly mobilePresentation = inject(MobilePresentationService);
  @ViewChild('notesGrid', { read: ElementRef })
  private set notesGrid(ref: ElementRef<HTMLElement> | undefined) {
    this.gridElement = ref?.nativeElement ?? null;
    if (this.gridElement) {
      this.masonry.observe(this.gridElement);
      this.scheduleLayout();
    } else {
      this.masonry.release();
    }
  }
  @ViewChildren('noteCard', { read: ElementRef }) private noteCards!: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('richEditor', { read: ElementRef })
  private set richEditor(ref: ElementRef<HTMLElement> | undefined) {
    if (ref && this.draft) {
      ref.nativeElement.innerHTML = this.sanitizer.sanitize(SecurityContext.HTML, this.draft.contentHtml) ?? '';
    }
  }
  private gridElement: HTMLElement | null = null;
  private cardsSubscription?: { unsubscribe(): void };
  private layoutFrame = 0;
  private flowMode = false;
  private readonly masonry = new MasonryController({
    gap: MASONRY_GAP,
    getContainer: () => this.gridElement,
    getItems: () => this.noteCards?.toArray().map((item) => item.nativeElement) ?? [],
    canLayout: () => {
      this.refreshFlowMode();
      return !this.isNative && !this.flowMode;
    },
    onSkipLayout: () => this.clearMasonryStyles()
  });

  editorOpen = false;
  editorBusy = false;
  editorError = '';
  draft: BoardNote | null = null;
  confirmDelete = false;
  /** Espera confirmación para descartar cambios sin guardar (diálogo sobre el editor). */
  confirmDiscard = false;
  attachmentUrls: Record<string, string> = {};
  private removedAttachments: BoardNoteAttachment[] = [];
  private uploadedDuringEdit: BoardNoteAttachment[] = [];
  /** Elemento que abrió el editor; el sheet devuelve el foco a él al cerrar. */
  protected editorOpener: HTMLElement | null = null;
  /** Variante móvil capturada al abrir el editor; no cambia mientras está abierto. */
  noteMobilePresentation: boolean | null = null;

  /** Cambios sin guardar que protegen el clic en el fondo (backdrop). Escape y el botón
   *  de cerrar siguen funcionando. */
  get hasUnsavedChanges(): boolean {
    const draft = this.draft;
    if (!draft) return false;
    return Boolean(
      draft.title.trim() ||
      draft.contentHtml.trim() ||
      this.uploadedDuringEdit.length > 0 ||
      this.removedAttachments.length > 0
    );
  }

  constructor() {
    addIcons({ add, attachOutline, close, downloadOutline, imageOutline, listOutline, pin, pinOutline, trash });
  }

  ngOnChanges(): void {
    this.refreshFlowMode();
    this.scheduleLayout();
  }

  @HostListener('window:resize')
  onViewportResize(): void {
    this.refreshFlowMode();
    this.scheduleLayout();
  }

  ngAfterViewInit(): void {
    this.cardsSubscription = this.noteCards.changes.subscribe(() => this.scheduleLayout());
    this.masonry.observe();
    this.scheduleLayout();
  }

  ngOnDestroy(): void {
    this.cardsSubscription?.unsubscribe();
    this.masonry.release();
    if (this.layoutFrame) cancelAnimationFrame(this.layoutFrame);
  }

  get orderedNotes(): BoardNote[] {
    const query = this.searchQuery.trim().toLocaleLowerCase();
    return orderedNotes(this.notes, this.pinnedNoteId).filter((note) =>
      !query || `${note.title} ${note.contentHtml.replace(/<[^>]*>/g, ' ')}`.toLocaleLowerCase().includes(query)
    );
  }

  get hasNotes(): boolean {
    return this.notes.length > 0;
  }

  get hasSearchResults(): boolean {
    return this.orderedNotes.length > 0;
  }

  get editingExistingNote(): boolean {
    return Boolean(this.draft && this.notes.some((note) => note.id === this.draft?.id));
  }

  isPinned(note: BoardNote): boolean {
    return this.pinnedNoteId === note.id;
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  createNote(): void {
    this.editorOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.noteMobilePresentation = this.mobilePresentation.snapshot();
    const now = new Date().toISOString();
    this.draft = {
      id: crypto.randomUUID(),
      title: '',
      contentHtml: '',
      position: this.notes.length,
      createdAt: now,
      updatedAt: now,
      attachments: []
    };
    this.removedAttachments = [];
    this.uploadedDuringEdit = [];
    this.attachmentUrls = {};
    this.editorError = '';
    this.confirmDelete = false;
    this.editorOpen = true;
  }

  async editNote(note: BoardNote, opener?: EventTarget | null): Promise<void> {
    this.editorOpener = opener instanceof HTMLElement ? opener : null;
    this.noteMobilePresentation = this.mobilePresentation.snapshot();
    this.draft = structuredClone(note);
    this.removedAttachments = [];
    this.uploadedDuringEdit = [];
    this.attachmentUrls = {};
    this.editorError = '';
    this.confirmDelete = false;
    this.editorOpen = true;
    await this.loadAttachmentUrls(this.draft.attachments);
  }

  togglePin(note: BoardNote, event: Event): void {
    event.stopPropagation();
    const next = setPinnedNote(this.notes, this.isPinned(note) ? null : note.id);
    this.pinnedNoteId = next;
    this.pinnedNoteIdChange.emit(next);
    this.scheduleLayout();
  }

  openFromKeyboard(event: KeyboardEvent, note: BoardNote): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    void this.editNote(note, event.currentTarget);
  }

  onTitleInput(value: string): void {
    if (this.draft) this.draft = { ...this.draft, title: value };
  }

  onEditorInput(event: Event): void {
    if (!this.draft) return;
    const editor = event.currentTarget as HTMLElement;
    this.draft = { ...this.draft, contentHtml: editor.innerHTML };
  }

  format(command: 'bold' | 'italic' | 'insertUnorderedList'): void {
    document.execCommand(command);
  }

  async addAttachments(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!this.draft || files.length === 0) return;

    this.editorBusy = true;
    this.editorError = '';
    try {
      for (const file of files) {
        const uploaded = await this.attachments.upload(file, this.boardId, this.draft.id);
        this.draft = { ...this.draft, attachments: [...this.draft.attachments, uploaded] };
        this.uploadedDuringEdit.push(uploaded);
        this.attachmentUrls[uploaded.id] = await this.attachments.signedUrl(uploaded.path);
      }
    } catch (error) {
      console.error('No se pudo adjuntar un archivo a la nota', error);
      this.editorError = error instanceof Error ? error.message : 'No se pudo adjuntar el archivo. Inténtalo de nuevo.';
    } finally {
      this.editorBusy = false;
    }
  }

  async removeAttachment(attachment: BoardNoteAttachment): Promise<void> {
    if (!this.draft) return;
    this.editorError = '';
    if (this.uploadedDuringEdit.some((item) => item.id === attachment.id)) {
      try {
        await this.attachments.remove(attachment.path);
        this.uploadedDuringEdit = this.uploadedDuringEdit.filter((item) => item.id !== attachment.id);
      } catch (error) {
        console.error('No se pudo eliminar el adjunto recién cargado', error);
        this.editorError = 'No se pudo eliminar el archivo. Inténtalo de nuevo.';
        return;
      }
    } else {
      this.removedAttachments.push(attachment);
    }
    this.draft = {
      ...this.draft,
      attachments: this.draft.attachments.filter((item) => item.id !== attachment.id)
    };
    delete this.attachmentUrls[attachment.id];
  }

  async downloadAttachment(attachment: BoardNoteAttachment): Promise<void> {
    const url = this.attachmentUrls[attachment.id];
    if (!url) return;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = attachment.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('No se pudo descargar el adjunto', error);
      this.editorError = 'No se pudo descargar el archivo. Inténtalo de nuevo.';
    }
  }

  async saveNote(): Promise<void> {
    const draft = this.draft;
    if (!draft || !draft.title.trim() || this.editorBusy) return;
    this.editorBusy = true;
    this.editorError = '';
    try {
      for (const attachment of this.removedAttachments) {
        await this.attachments.remove(attachment.path);
      }
      const saved = {
        ...draft,
        title: draft.title.trim(),
        contentHtml: this.sanitizer.sanitize(SecurityContext.HTML, draft.contentHtml) ?? '',
        updatedAt: new Date().toISOString()
      };
      const existing = this.notes.some((note) => note.id === saved.id);
      const next = existing
        ? this.notes.map((note) => note.id === saved.id ? saved : note)
        : [...this.notes, { ...saved, position: this.notes.length }];
      this.notesChange.emit(next);
      this.finishEditing();
    } catch (error) {
      console.error('No se pudo guardar la nota', error);
      this.editorError = 'No se pudieron guardar los cambios de adjuntos. Inténtalo de nuevo.';
    } finally {
      this.editorBusy = false;
    }
  }

  async cancelEditing(): Promise<void> {
    if (this.editorBusy) return;
    this.editorError = '';
    try {
      for (const attachment of this.uploadedDuringEdit) {
        await this.attachments.remove(attachment.path);
      }
      this.finishEditing();
    } catch (error) {
      console.error('No se pudieron limpiar adjuntos de la nota descartada', error);
      this.editorError = 'No se pudieron limpiar los adjuntos. Inténtalo de nuevo antes de cerrar.';
    }
  }

  /** El usuario pide cerrar el editor (X, Escape, Atrás o Cancelar). Con cambios sin
   *  guardar se abre el diálogo de confirmación y el editor se queda abierto. Sin
   *  cambios, o guardando, se descarta directo sin confirmar. */
  onCloseRequested(): void {
    if (this.editorBusy) return;
    if (this.hasUnsavedChanges) {
      this.confirmDiscard = true;
      return;
    }
    this.cancelEditing();
  }

  /** Clic en el fondo: con cambios sin guardar y sin operación en curso abre el diálogo
   *  de confirmación (seguir editando / descartar). Sin cambios cierra directo. */
  onBackdropClick(): void {
    if (this.editorBusy) return;
    if (this.hasUnsavedChanges) {
      this.confirmDiscard = true;
      return;
    }
    this.cancelEditing();
  }

  /** Cierra el diálogo de confirmación y vuelve al editor con el texto intacto. */
  closeConfirm(): void {
    this.confirmDiscard = false;
  }

  /** Descarta los cambios y cierra el editor. */
  discardChanges(): void {
    this.confirmDiscard = false;
    this.cancelEditing();
  }

  async deleteNote(): Promise<void> {
    if (!this.draft || !this.confirmDelete || this.editorBusy) {
      this.confirmDelete = true;
      return;
    }
    this.editorBusy = true;
    this.editorError = '';
    try {
      for (const attachment of this.draft.attachments) {
        await this.attachments.remove(attachment.path);
      }
      this.notesChange.emit(this.notes.filter((note) => note.id !== this.draft?.id));
      if (this.pinnedNoteId === this.draft.id) {
        this.pinnedNoteId = null;
        this.pinnedNoteIdChange.emit(null);
      }
      this.finishEditing();
    } catch (error) {
      console.error('No se pudo eliminar la nota o sus adjuntos', error);
      this.editorError = 'No se pudo eliminar la nota y sus adjuntos. Inténtalo de nuevo.';
    } finally {
      this.editorBusy = false;
    }
  }

  isImage(attachment: BoardNoteAttachment): boolean {
    return attachment.mimeType.startsWith('image/');
  }

  private async loadAttachmentUrls(items: BoardNoteAttachment[]): Promise<void> {
    try {
      const entries = await Promise.all(items.map(async (item) =>
        [item.id, await this.attachments.signedUrl(item.path)] as const
      ));
      this.attachmentUrls = Object.fromEntries(entries);
    } catch (error) {
      console.error('No se pudieron abrir los adjuntos de la nota', error);
      this.editorError = 'No se pudieron cargar los adjuntos. Comprueba tu conexión e inténtalo de nuevo.';
    }
  }

  private finishEditing(): void {
    this.editorOpen = false;
    this.noteMobilePresentation = null;
    this.draft = null;
    this.removedAttachments = [];
    this.uploadedDuringEdit = [];
    this.attachmentUrls = {};
    const opener = this.editorOpener;
    this.editorOpener = null;
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
    });
  }

  private scheduleLayout(): void {
    if (this.layoutFrame) cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = 0;
      this.refreshFlowMode();
      this.masonry.scheduleLayout();
    });
  }

  private refreshFlowMode(): void {
    const width = this.gridElement?.clientWidth ?? 0;
    const next = resolveBoardFlowMode(this.flowMode, width);
    if (next === this.flowMode) return;
    this.flowMode = next;
    if (next) this.clearMasonryStyles();
  }

  get notesFlowMode(): boolean {
    return this.flowMode;
  }

  private clearMasonryStyles(): void {
    if (this.gridElement) {
      this.gridElement.style.position = '';
      this.gridElement.style.height = '';
      this.gridElement.style.minHeight = '';
    }
    this.noteCards?.forEach(({ nativeElement }) => {
      nativeElement.style.position = '';
      nativeElement.style.width = '';
      nativeElement.style.left = '';
      nativeElement.style.top = '';
    });
  }
}
