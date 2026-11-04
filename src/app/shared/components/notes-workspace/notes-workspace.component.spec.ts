import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { NoteAttachmentService } from '../../../services/note-attachment.service';
import { NotesWorkspaceComponent } from './notes-workspace.component';

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
      imports: [NotesWorkspaceComponent],
      providers: [{
        provide: NoteAttachmentService,
        useValue: {
          upload: vi.fn(),
          signedUrl: vi.fn().mockResolvedValue('https://example.test/attachment'),
          remove: vi.fn()
        }
      }]
    });
  });

  it('muestra el contenido enriquecido en la vista completa y abre la nota', async () => {
    const { host, fixture } = mount();
    expect(host.querySelector('.note-preview')?.textContent).toContain('Detalle importante');

    (host.querySelector('.note-card') as HTMLElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();
    expect(host.querySelector('.note-rich-editor')?.textContent).toContain('Detalle importante');
  });

  it('en tarjetas compactas muestra solo el título hasta abrir la nota', async () => {
    const { fixture, host } = mount();
    fixture.componentRef.setInput('isNative', true);
    fixture.componentRef.setInput('compactCards', true);
    fixture.detectChanges();
    expect(host.querySelector('.note-card h3')?.textContent).toBe('Idea');
    expect(host.querySelector('.note-preview')).toBeNull();

    (host.querySelector('.note-card') as HTMLElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('.note-rich-editor')?.textContent).toContain('Detalle importante');
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
    const { component, host, fixture } = mount();
    const emitted: unknown[] = [];
    component.notesChange.subscribe((notes) => emitted.push(notes));
    (host.querySelector('.new-note-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const title = host.querySelector('.note-title-input') as HTMLInputElement;
    title.value = 'Nueva idea';
    title.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const editor = host.querySelector('.note-rich-editor') as HTMLElement;
    editor.innerHTML = '<p><strong>Texto</strong></p><img src="x" onerror="alert(1)">';
    editor.dispatchEvent(new Event('input'));
    (host.querySelector('.note-save-button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual(expect.arrayContaining([expect.objectContaining({
      title: 'Nueva idea',
      contentHtml: expect.not.stringContaining('onerror')
    })]));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
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
});
