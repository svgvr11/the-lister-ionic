import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { Overlay } from '@angular/cdk/overlay';
import { of } from 'rxjs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NoteAttachmentService } from '../../../services/note-attachment.service';
import { NotesWorkspaceComponent } from './notes-workspace.component';
import { SheetDialogComponent } from '../sheet-dialog/sheet-dialog.component';
import { CloseButtonComponent } from '../close-button/close-button.component';

class MockOverlay {
  create() {
    return {
      attach: () => ({ rootNodes: [], overlayElement: document.createElement('div') }),
      overlayElement: document.createElement('div'),
      backdropClick: () => of(null),
      dispose: () => undefined
    };
  }
  position = () => {
    const g = {
      bottom: () => g,
      left: () => g,
      centerHorizontally: () => g,
      centerVertically: () => g
    };
    return { global: () => g };
  };
  scrollStrategies = { block: () => ({}) };
}

function mount(): {
  fixture: ComponentFixture<NotesWorkspaceComponent>;
  component: NotesWorkspaceComponent;
  host: HTMLElement;
} {
  const fixture = TestBed.createComponent(NotesWorkspaceComponent);
  fixture.componentRef.setInput('notes', [{
    id: 'note-1',
    title: 'Idea',
    contentHtml: '<p>Detalle <strong>importante</strong></p>',
    position: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    attachments: []
  }]);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, host: fixture.nativeElement };
}

describe('NotesWorkspaceComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NotesWorkspaceComponent, SheetDialogComponent, CloseButtonComponent],
      providers: [{
        provide: NoteAttachmentService,
        useValue: {
          upload: vi.fn(),
          signedUrl: vi.fn().mockResolvedValue('https://example.test/attachment'),
          remove: vi.fn()
        }
      }, {
        provide: Overlay,
        useClass: MockOverlay
      }, {
        provide: DOCUMENT,
        useValue: document
      }]
    });
  });

  it('muestra el contenido enriquecido en la vista completa y abre la nota', async () => {
    const { host, component, fixture } = mount();
    expect(host.querySelector('.note-preview')?.textContent).toContain('Detalle importante');

    (host.querySelector('.note-card') as HTMLElement).click();
    await fixture.whenStable();

    expect(component.editorOpen).toBe(true);
    expect(component.draft?.title).toBe('Idea');
    expect(component.draft?.contentHtml).toContain('Detalle');
    expect(component.draft?.contentHtml).toContain('importante');
  });

  it('en tarjetas compactas muestra solo el título hasta abrir la nota', async () => {
    const { fixture, host, component } = mount();
    fixture.componentRef.setInput('isNative', true);
    fixture.componentRef.setInput('compactCards', true);
    fixture.detectChanges();
    expect(host.querySelector('.note-card h3')?.textContent).toBe('Idea');
    expect(host.querySelector('.note-preview')).toBeNull();

    (host.querySelector('.note-card') as HTMLElement).click();
    await fixture.whenStable();

    expect(component.editorOpen).toBe(true);
    expect(component.draft?.contentHtml).toContain('Detalle');
    expect(component.draft?.contentHtml).toContain('importante');
  });

  it('en la vista nativa completa apila las notas en flujo normal', () => {
    const { fixture, host } = mount();
    fixture.componentRef.setInput('isNative', true);
    fixture.componentRef.setInput('compactCards', false);
    fixture.detectChanges();
    expect(host.querySelector('.notes-grid')?.classList.contains('notes-grid--flow')).toBe(true);
    expect(host.querySelector('.note-preview')?.textContent).toContain('Detalle importante');
  });

  it('guarda una nueva nota con el texto enriquecido y emite los datos', async () => {
    const { component, fixture } = mount();
    const emitted: unknown[] = [];
    component.notesChange.subscribe((notes) => emitted.push(notes));

    component.createNote();
    await fixture.whenStable();
    expect(component.editorOpen).toBe(true);
    expect(component.draft).not.toBeNull();

    component.onTitleInput('Nueva idea');
    component.onEditorInput({ currentTarget: { innerHTML: '<p><strong>Texto</strong></p>' } } as unknown as Event);
    await fixture.whenStable();

    await component.saveNote();
    await fixture.whenStable();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual(expect.arrayContaining([expect.objectContaining({
      title: 'Nueva idea',
      contentHtml: expect.not.stringContaining('onerror')
    })]));
    expect(component.editorOpen).toBe(false);
  });

  it('no guarda si el título está vacío', async () => {
    const { component } = mount();
    const emitted: unknown[] = [];
    component.notesChange.subscribe((notes) => emitted.push(notes));

    component.createNote();
    await component.saveNote();

    expect(emitted).toHaveLength(0);
    expect(component.editorOpen).toBe(true);
  });

  it('cancela la edición sin emitir cambios', () => {
    const { component } = mount();
    const emitted: unknown[] = [];
    component.notesChange.subscribe((notes) => emitted.push(notes));

    component.createNote();
    component.onTitleInput('Borrador');
    component.cancelEditing();

    expect(component.editorOpen).toBe(false);
    expect(component.draft).toBeNull();
    expect(emitted).toHaveLength(0);
  });

  it('fija y desfija una nota al inicio', () => {
    const { component, host } = mount();
    const emitted: Array<string | null> = [];
    component.pinnedNoteIdChange.subscribe((id) => emitted.push(id));
    const pinButton = host.querySelector('.note-pin-button') as HTMLButtonElement;
    pinButton.click();
    expect(emitted).toEqual(['note-1']);
    expect(component.pinnedNoteId).toBe('note-1');
  });

  it('reconoce cambios sin guardar para proteger el fondo (backdrop)', () => {
    const { component } = mount();
    component.createNote();
    expect(component.hasUnsavedChanges).toBe(false);

    component.onTitleInput('Título');
    expect(component.hasUnsavedChanges).toBe(true);
  });

  it('cierra directo si no hay cambios sin guardar', () => {
    const { component } = mount();
    const emitted: unknown[] = [];
    component.notesChange.subscribe((notes) => emitted.push(notes));

    component.createNote();
    component.onCloseRequested();

    expect(component.confirmDiscard).toBe(false);
    expect(component.editorOpen).toBe(false);
    expect(component.draft).toBeNull();
    expect(emitted).toHaveLength(0);
  });

  it('con cambios sin guardar, pedir cerrar abre la confirmación y deja el editor abierto', () => {
    const { component } = mount();
    const emitted: unknown[] = [];
    component.notesChange.subscribe((notes) => emitted.push(notes));

    component.createNote();
    component.onTitleInput('Título');
    expect(component.hasUnsavedChanges).toBe(true);

    component.onCloseRequested();

    expect(component.confirmDiscard).toBe(true);
    expect(component.editorOpen).toBe(true);
    expect(component.draft?.title).toBe('Título');
    expect(emitted).toHaveLength(0);
  });

  it('el clic en el fondo con cambios sin guardar abre la confirmación y deja el editor abierto', () => {
    const { component } = mount();
    const emitted: unknown[] = [];
    component.notesChange.subscribe((notes) => emitted.push(notes));

    component.createNote();
    component.onTitleInput('Título');
    expect(component.hasUnsavedChanges).toBe(true);
    component.onBackdropClick();

    expect(component.confirmDiscard).toBe(true);
    expect(component.editorOpen).toBe(true);
    expect(component.draft?.title).toBe('Título');
    expect(emitted).toHaveLength(0);
  });

  it('el clic en el fondo sin cambios cierra directo', () => {
    const { component } = mount();
    const emitted: unknown[] = [];
    component.notesChange.subscribe((notes) => emitted.push(notes));

    component.createNote();
    component.onBackdropClick();

    expect(component.confirmDiscard).toBe(false);
    expect(component.editorOpen).toBe(false);
    expect(component.draft).toBeNull();
    expect(emitted).toHaveLength(0);
  });

  it('editorBusy no confirma ni cierra el editor', () => {
    const { component } = mount();
    component.createNote();
    component.onTitleInput('Título');
    component.editorBusy = true;

    component.onCloseRequested();
    component.onBackdropClick();

    expect(component.confirmDiscard).toBe(false);
    expect(component.editorOpen).toBe(true);
    expect(component.draft?.title).toBe('Título');
  });

  it('seguir editando cierra la confirmación y deja el editor y el texto intactos', () => {
    const { component } = mount();
    component.createNote();
    component.onTitleInput('Título');
    component.onCloseRequested();
    expect(component.confirmDiscard).toBe(true);

    component.closeConfirm();

    expect(component.confirmDiscard).toBe(false);
    expect(component.editorOpen).toBe(true);
    expect(component.draft?.title).toBe('Título');
  });

  it('descartar cambios cierra el editor y limpia el borrador', () => {
    const { component } = mount();
    const emitted: unknown[] = [];
    component.notesChange.subscribe((notes) => emitted.push(notes));

    component.createNote();
    component.onTitleInput('Título');
    component.onCloseRequested();
    component.discardChanges();

    expect(component.confirmDiscard).toBe(false);
    expect(component.editorOpen).toBe(false);
    expect(component.draft).toBeNull();
    expect(emitted).toHaveLength(0);
  });
});
