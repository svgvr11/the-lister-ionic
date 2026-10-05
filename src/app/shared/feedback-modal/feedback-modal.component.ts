import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmark, chevronDown, close, mailOutline, megaphoneOutline, trashOutline } from 'ionicons/icons';
import { toSignal } from '@angular/core/rxjs-interop';
import { EMPTY_FEEDBACK_DRAFT, FeedbackDraft, FeedbackService, PreparedImage } from '../../core/services/feedback.service';
import {
  ACCEPTED_IMAGE_TYPES,
  canAcceptMore,
  imageAlt,
  prepareImage,
  releaseImage
} from '../../core/services/feedback-images';
import { ConnectivityService } from '../../core/services/connectivity.service';
import {
  FEEDBACK_TYPE_CHIPS,
  FeedbackType,
  MAX_IMAGES,
  MESSAGE_MAX_LENGTH,
  MESSAGE_MIN_LENGTH
} from '../../core/feedback-core';

/**
 * MODAL DE COMENTARIOS Y ERRORES
 *
 * Toma el estilo y el comportamiento de accesibilidad del diálogo de ayuda de
 * archive.page.html: fondo a media opacidad, tarjeta con cabecera (ícono + título + subtítulo +
 * X), acción principal abajo y foco que entra, se queda dentro y vuelve al botón que la abrió.
 *
 * Diferencias con el diálogo de ayuda: aquí hay scroll interno (el formulario es largo), un
 * diálogo de confirmación de descarte antes de perder lo escrito, y los errores van en una
 * región aria-live para que un lector de pantalla los anuncie.
 */
@Component({
  selector: 'app-feedback-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonIcon, IonRippleEffect],
  templateUrl: './feedback-modal.component.html',
  styleUrls: ['./feedback-modal.component.scss']
})
export class FeedbackModalComponent implements AfterViewInit, OnDestroy {
  private readonly feedback = inject(FeedbackService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly router = inject(Router);

  /** Conectado o no; es una señal para que la plantilla reaccione al vuelo. */
  readonly online = toSignal(this.connectivity.online$, { initialValue: true });

  /**
   * Avisa al tablero de que el modal se ha cerrado, para que lo desmonte y devuelva el foco.
   * Es un output (no un método) para que el modal no necesite saber quién lo abrió.
   */
  readonly closed = output<void>();

  readonly chips = FEEDBACK_TYPE_CHIPS;
  readonly maxImages = MAX_IMAGES;
  readonly minLength = MESSAGE_MIN_LENGTH;
  readonly maxLength = MESSAGE_MAX_LENGTH;
  readonly acceptedTypes = ACCEPTED_IMAGE_TYPES;

  draft: FeedbackDraft = this.feedback.restoreDraft();
  images: PreparedImage[] = [];
  /** El desplegable "Ver qué se enviará". */
  showDiagnostics = false;
  /** Modal enviado con éxito: la vista cambia a la confirmación. */
  sent = false;
  busy = false;
  /** Mensaje de error de envío, o de descarte, el que toque en cada momento. */
  errorMessage = '';
  /** Confirmación de descarte pendiente, cuando hay algo escrito que perder. */
  confirmingDiscard = false;
  diagnosticsPreview = '';

  /** Foco inicial: el primer tipo, que es donde empieza el formulario. */
  @ViewChild('dialog', { read: ElementRef }) private dialog?: ElementRef<HTMLElement>;
  @ViewChild('primary', { read: ElementRef }) private primary?: ElementRef<HTMLElement>;
  @ViewChild('typeGroup', { read: ElementRef }) private typeGroup?: ElementRef<HTMLElement>;
  @ViewChild('fileInput', { read: ElementRef }) private fileInput?: ElementRef<HTMLInputElement>;

  constructor() {
    addIcons({ checkmark, chevronDown, close, mailOutline, megaphoneOutline, trashOutline });
  }

  ngOnDestroy(): void {
    this.releaseImages();
  }

  /**
   * El foco entra en el modal en cuanto existe: en la primera ficha de tipo, que es por donde
   * se empieza a rellenar. Se hace en ngAfterViewInit (y no con `autofocus`, que depende del
   * orden de pintado y no es fiable) y en un temporizador de 0 para ganar al painted del `*ngIf`.
   */
  ngAfterViewInit(): void {
    this.focusInitial();
  }

  // ── Estado derivado ───────────────────────────────────────────────────────

  get messageLength(): number {
    return this.draft.message.length;
  }

  get messageTooShort(): boolean {
    return this.draft.message.trim().length > 0 && this.draft.message.trim().length < this.minLength;
  }

  get canSend(): boolean {
    return this.feedback.canSend(this.draft, this.images.length, this.online(), this.busy);
  }

  get offlineBlocked(): boolean {
    return !this.online();
  }

  /** Hay algo que perder: texto escrito o imágenes adjuntas. */
  get hasDraftContent(): boolean {
    return this.draft.message.trim().length > 0 || this.images.length > 0;
  }

// ── Formulario ────────────────────────────────────────────────────────────

  selectType(type: FeedbackType): void {
    this.draft = { ...this.draft, type };
    this.errorMessage = '';
    this.saveDraft();
  }

  onInput(): void {
    // Cada pulsación recalcula el botón y guarda el borrador para que no se pierda al cerrar.
    this.saveDraft();
    if (!this.busy) this.errorMessage = '';
  }

  /** La casilla de "Incluir información técnica" también forma parte del borrador. */
  onDiagnosticsToggle(): void {
    this.draft = { ...this.draft, includeDiagnostics: this.draft.includeDiagnostics };
    this.saveDraft();
    if (this.showDiagnostics) this.diagnosticsPreview = this.feedback.diagnosticsPreview();
  }

  onImageError(event: Event): void {
    // Si el usuario cancela el diálogo de archivos no se avisa: event.target.value ya está vacío.
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) this.errorMessage = 'No se pudieron adjuntar las imágenes.';
    input.value = '';
  }

  /**
   * Los archivos entran por un `<input type="file">` normal: el WebView de Android lo abre con
   * el selector del sistema sin pedir permisos nuevos y sin el plugin de cámara.
   */
  openFilePicker(): void {
    this.errorMessage = '';
    this.fileInput?.nativeElement.click();
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // El input se vacía siempre: si no, elegir los mismos archivos dos veces no dispararía change.
    input.value = '';
    if (!files.length) return;

    this.errorMessage = '';
    if (!canAcceptMore(this.images.length, files.length)) {
      this.errorMessage = `Puedes adjuntar hasta ${this.maxImages} imágenes por reporte.`;
      return;
    }

    this.busy = true;
    try {
      for (const file of files) {
        if (!canAcceptMore(this.images.length, 1)) {
          this.errorMessage = `Solo caben ${this.maxImages} imágenes por reporte.`;
          break;
        }
        try {
          this.images = [...this.images, await prepareImage(file, this.images.length)];
        } catch (error) {
          // Una imagen inválida no tira el resto: se avisa y se sigue con las demás.
          this.errorMessage = error instanceof Error ? error.message : 'No se pudo adjuntar una imagen.';
        }
      }
    } finally {
      this.busy = false;
    }
  }

  removeImage(index: number): void {
    const objetivo = this.images[index];
    if (!objetivo) return;
    releaseImage(objetivo);
    this.images = this.images.filter((_, i) => i !== index);
    this.errorMessage = '';
  }

  imageAltText(index: number): string {
    return imageAlt(index, this.images.length);
  }

  toggleDiagnostics(): void {
    this.showDiagnostics = !this.showDiagnostics;
    if (this.showDiagnostics) this.diagnosticsPreview = this.feedback.diagnosticsPreview();
  }

  openPrivacy(event: Event): void {
    // Navegación interna: el enlace nunca sale de la app y el modal se cierra detrás.
    event.preventDefault();
    void this.router.navigateByUrl('/privacy');
    this.close();
  }

// ── Envío ──────────────────────────────────────────────────────────────────

  /**
   * Un envío por apertura: `busy` se enciende antes de la llamada y el botón queda
   * deshabilitado mientras tanto, así que un doble clic no dispara dos peticiones ni crea dos
   * reportes. En un error NO se limpia nada: el texto y las imágenes se quedan para reintentar.
   */
  async submit(): Promise<void> {
    if (this.busy || this.sent) return;
    if (!this.canSend) {
      if (this.offlineBlocked) this.errorMessage = 'Sin conexión: no se puede enviar ahora.';
      return;
    }

    this.busy = true;
    this.errorMessage = '';
    try {
      const resultado = await this.feedback.send(this.draft, this.images);
      if (resultado.ok) {
        this.sent = true;
        this.diagnosticsPreview = '';
      } else {
        this.errorMessage = resultado.message;
        // Foco al mensaje de error para que un lector de pantalla lo anuncie de inmediato.
        setTimeout(() => this.dialog?.nativeElement.querySelector<HTMLElement>('.feedback-error')?.focus(), 0);
      }
    } finally {
      this.busy = false;
    }
  }

  // ── Cierre ────────────────────────────────────────────────────────────────

  /**
   * Escape y el clic en el fondo son cierres ACCIDENTALES: por eso, si hay texto escrito o
   * imágenes, no cierran de golpe sino que preguntan. Un clic torpe en el fondo no puede
   * borrar medio párrafo.
   *
   * La X y el botón "Cancelar" son cierres INTENCIONALES y sí cierran directamente: quien
   * pulsa "Cancelar" ha decidido cerrar, y además así el borrador sobrevive para cuando vuelva
   * a abrir el modal (está guardado en el servicio). Para perderlo de verdad está "Descartar",
   * dentro del diálogo de confirmación.
   */
  requestClose(): void {
    if (this.confirmingDiscard) return;
    if (this.hasDraftContent && !this.sent) {
      this.confirmingDiscard = true;
      this.errorMessage = '';
      setTimeout(() => this.primary?.nativeElement.focus(), 0);
      return;
    }
    this.close();
  }

  /** Cierre intencional (X o "Cancelar"): se conserva el borrador de esta sesión. */
  closeKeepingDraft(): void {
    this.saveDraft();
    this.close();
  }

  /** Cierra y borra el borrador guardado: es lo que hace "Descartar". */
  confirmDiscard(): void {
    this.releaseImages();
    this.resetForm();
    this.feedback.clearDraft();
    this.close();
  }

  cancelDiscard(): void {
    this.confirmingDiscard = false;
    setTimeout(() => this.primary?.nativeElement.focus(), 0);
  }

  /**
   * Cierre real. Solo vacía el formulario cuando el envío se completó (o el usuario confirmó el
   * descarte): un fallo de red deja el texto y las imágenes intactos para poder reintentar.
   * El tablero es quien devuelve el foco al botón que lo abrió, así que aquí solo se avisa.
   */
  close(): void {
    if (this.sent) {
      this.releaseImages();
      this.resetForm();
      this.feedback.clearDraft();
    }
    this.confirmingDiscard = false;
    this.showDiagnostics = false;
    this.diagnosticsPreview = '';
    this.errorMessage = '';
    this.sent = false;
    this.closed.emit();
  }

  /** Vacía el formulario entero (tras un envío correcto o un descarte). */
  private resetForm(): void {
    this.draft = { ...EMPTY_FEEDBACK_DRAFT };
    this.images = [];
  }

  /** Copia el borrador al servicio para que sobreviva a cerrar y reabrir el modal. */
  private saveDraft(): void {
    this.feedback.keepDraft(this.draft);
  }

  // ── Foco y teclado ────────────────────────────────────────────────────────

  /** El foco entra en el primer tipo, que es por donde se empieza a rellenar. */
  focusInitial(): void {
    setTimeout(() => this.typeGroup?.nativeElement.querySelector<HTMLElement>('button')?.focus(), 0);
  }

  /**
   * Focus trap del borde del ciclo, como el del diálogo de ayuda: al tabular, si se sale por
   * detrás, vuelve al primer control. Se consideran los controles que no están deshabilitados.
   */
  keepFocusInDialog(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const dialog = this.dialog?.nativeElement;
    if (!dialog) return;
    const controles = Array.from(
      dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href]')
    ).filter((elemento) => elemento.offsetParent !== null || elemento === document.activeElement);
    if (controles.length === 0) return;
    const primero = controles[0];
    const ultimo = controles[controles.length - 1];
    const activo = document.activeElement;
    if (event.shiftKey ? activo === primero || !dialog.contains(activo) : activo === ultimo) {
      event.preventDefault();
      (event.shiftKey ? ultimo : primero).focus();
    }
  }

  private releaseImages(): void {
    for (const image of this.images) releaseImage(image);
  }
}