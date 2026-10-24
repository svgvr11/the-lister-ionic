import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  DoCheck,
  ElementRef,
  HostBinding,
  HostListener,
  Injector,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren,
  afterNextRender,
  inject
} from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonRippleEffect, IonToolbar, NavController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  archiveOutline, arrowBack, arrowUndoOutline, checkmark, chevronBack, chevronDown,
  chevronForward, close, helpCircleOutline, timeOutline, trash
} from 'ionicons/icons';
import { Subscription } from 'rxjs';
import { ChecklistArchivedList, ChecklistBoard, ChecklistList, ChecklistTask } from '../../models/board.model';
import { readStoredTheme } from '../../core/board-themes';
import {
  ARCHIVE_RETENTION_DAYS, archiveDaysLeft, archiveUrgency, countdownLabel, purgeExpiredArchivedLists
} from '../../core/list/archive/archive';
import { isListComplete, listLimitRestoreMessage } from '../../core/list/list-retention/list-retention';
import {
  claseUrgencia,
  diasRestantesSeguro,
  eliminarDelArchivo,
  esUrgente,
  ordenarEntradasPorFecha,
  restaurarDesdeArchivo
} from '../../core/board-retention-page-rules';
import {
  completedTaskCount,
  listProgressPercent,
  taskCounterLabel
} from '../../core/board-list-rules';
import { completedTasks, pendingTasks } from '../../core/board-task-rules';
import { MAX_LIST_TITLE_LENGTH, normalizeListTitle } from '../../core/platform/limits/limits';
import { MasonryController, MASONRY_GAP } from '../../core/masonry-layout';
import { AuthService } from '../../services/auth.service';
import { BoardSessionService } from '../../services/board-session.service';
import { OverlayStackService, RegisteredOverlay } from '../../services/overlay-stack.service';

/** Lista archivada pendiente de eliminar para siempre, a la espera de confirmar. */
type PendingAction = { kind: 'delete'; entry: ChecklistArchivedList };

/**
 * Archivo de listas: muestra las listas 100% completas que se han archivado, con los días
 * que les quedan antes de eliminarse de forma permanente, y permite restaurarlas o
 * borrarlas definitivamente.
 *
 * Replica la estructura de trash.page.* (mismo header, tema, safe areas y maquetado),
 * cambiando el plazo a 60 días y el tramo rojo a los 3 últimos días.
 */
@Component({
  selector: 'app-archive',
  standalone: true,
  imports: [CommonModule, IonContent, IonHeader, IonIcon, IonRippleEffect, IonToolbar],
  templateUrl: './archive.page.html',
  styleUrls: ['./archive.page.scss']
})
export class ArchivePage implements OnInit, AfterViewInit, OnDestroy, DoCheck {
  private readonly session = inject(BoardSessionService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly navController = inject(NavController);
  private readonly injector = inject(Injector);
  private readonly overlayStack = inject(OverlayStackService);
  private subscription?: Subscription;
  private pageActive = false;

  board: ChecklistBoard = {
    id: '', title: '', createdAt: new Date().toISOString(), lists: [], archivedLists: []
  };
  loading = true;
  loadError = '';
  saveError = '';
  /** Aviso del límite de 50 listas al pulsar "Restaurar lista"; la lista no se mueve. */
  restoreError = '';
  busy = false;
  collapsed = new Set<string>();
  pendingAction: PendingAction | null = null;
  /** Abre la guía "¿Cómo funciona el Archivo?" desde el botón de la banda informativa. */
  helpOpen = false;

  /**
   * Rejilla del archivo. Se declara con setter a propósito: el contenedor vive bajo un
   * `*ngIf`, así que se crea y se destruye en caliente. El setter es el aviso fiable para
   * atar el observador al nodo vivo (y soltarlo cuando desaparece), que es justo lo que
   * faltaba para que el masonry se readaptara al cambiar el ancho de la ventana.
   */
  @ViewChild('archiveGrid', { read: ElementRef, static: false })
  private set archiveGrid(ref: ElementRef<HTMLElement> | undefined) {
    this.archiveGridElement = ref?.nativeElement ?? null;
    if (this.archiveGridElement) {
      this.masonry.observe(this.archiveGridElement);
      this.scheduleMasonryLayout();
    } else {
      this.masonry.release();
    }
  }
  private archiveGridElement: HTMLElement | null = null;

  @ViewChildren('archiveCard', { read: ElementRef })
  private archiveCards!: QueryList<ElementRef<HTMLElement>>;

  /**
   * Botón de ayuda de la banda informativa y cuadro del modal. Se guardan para mover el
   * foco al abrir y devolverlo al botón al cerrar.
   */
  @ViewChild('helpButton', { read: ElementRef }) private helpButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('helpDialog', { read: ElementRef }) private helpDialog?: ElementRef<HTMLElement>;
  @ViewChild('helpPrimary', { read: ElementRef }) private helpPrimary?: ElementRef<HTMLButtonElement>;
  @ViewChild('archiveDeleteCancel', { read: ElementRef })
  private set archiveDeleteCancel(button: ElementRef<HTMLButtonElement> | undefined) {
    if (button) requestAnimationFrame(() => button.nativeElement.focus());
  }
  private pendingActionOpener: HTMLElement | null = null;

  private mobilePresentationQuery: MediaQueryList | null = null;
  private isMobilePresentation = false;
  /**
   * Ciclo de vida del masonry. Observa la rejilla y recalcula en vivo cuando cambia el
   * ancho del contenedor (ventana, zoom, rotación o barra de scroll).
   */
  private readonly masonry = new MasonryController({
    gap: MASONRY_GAP,
    getContainer: () => this.archiveGridElement,
    getItems: () => this.archiveCards?.toArray().map((item) => item.nativeElement) ?? []
  });
  private readonly onMobilePresentationChange = (event: MediaQueryListEvent): void => {
    this.isMobilePresentation = event.matches;
    this.scheduleMasonryLayout();
  };

  /**
   * Momento de referencia de la cuenta atrás. Los días se calculan al renderizar a partir
   * de esta fecha, así que no hay ningún temporizador por tarjeta: basta con actualizarla
   * al abrir la página y al volver a primer plano.
   */
  private now = new Date();

  /**
   * Reutiliza el color elegido en el menú de perfil de este dispositivo. Se lee al
   * construir la pantalla y solo de la caché local, para que el primer pintado no salga
   * con otro color.
   *
   * El acento se expone como `--accent`, igual que en el tablero, y lo usan el botón de
   * ayuda y el modal, así que al cambiar de tema el archivo se entera sin recargar.
   */
  @HostBinding('style.--board-bg') boardBackground = readStoredTheme().background;
  @HostBinding('style.--accent') themeAccent = readStoredTheme().accent;

  /** Cinta informativa: el número sale de la misma constante que usa la cuenta atrás. */
  readonly retentionNotice =
    `Las listas archivadas se conservan hasta ${ARCHIVE_RETENTION_DAYS} días y luego se eliminan de forma permanente.`;

  /** Texto de la tarjeta de ayuda, que solo se muestra cuando el archivo está vacío. */
  readonly helpText =
    'Al completar tus listas, puedes enviarlas al archivo para mantener limpio tu espacio de trabajo manteniendo acceso a trabajo terminado recientemente.';

  /**
   * Cuerpo del modal de ayuda: la misma explicación de la tarjeta del estado vacío más el
   * plazo de retención. El número sale de la constante de la purga, nunca escrito a mano.
   */
  readonly helpModalText =
    `${this.helpText} Las listas archivadas se conservarán durante ${ARCHIVE_RETENTION_DAYS} `
    + 'días antes de su eliminación permanente, pudiendo restaurarlas o eliminarlas en cualquier momento.';

  /** Aviso secundario del modal: qué significa el contador de cada tarjeta. */
  readonly helpCounterNote = 'El contador de días indica el tiempo restante antes del borrado automático.';

  /**
   * De la lista archivada más reciente a la más antigua. El orden lo fija la fecha y no el
   * usuario, así que en el archivo no tiene sentido arrastrar para reordenar.
   */
  get archivedLists(): ChecklistArchivedList[] {
    return ordenarEntradasPorFecha(this.board.archivedLists ?? [], (entry) => entry.archivedAt);
  }

  get isEmpty(): boolean {
    return this.archivedLists.length === 0;
  }

  /** Límite de caracteres para títulos de lista, expuesto al template. */
  readonly maxListTitleLength = MAX_LIST_TITLE_LENGTH;

  /**
   * Recorta un título a maxListTitleLength para aria-label/title, añadiendo ellipsis si se recorta.
   */
  truncateTitle(title: string): string {
    if (!title) return '';
    const codePoints = Array.from(title);
    if (codePoints.length <= this.maxListTitleLength) return title;
    return codePoints.slice(0, this.maxListTitleLength).join('') + '…';
  }

  trackByEntryId(_: number, entry: ChecklistArchivedList): string {
    return entry.list.id;
  }

  constructor() {
    addIcons({
      archiveOutline, arrowBack, arrowUndoOutline, checkmark, chevronBack, chevronDown,
      chevronForward, close, helpCircleOutline, timeOutline, trash
    });
  }

  ngOnInit(): void {
    this.initializeMobilePresentation();
    void this.loadArchive();
  }

  ngAfterViewInit(): void {
    this.archiveCards.changes.subscribe(() => this.scheduleMasonryLayout());
    this.scheduleMasonryLayout();
  }

  scheduleMasonryLayout(): void {
    this.masonry.scheduleLayout();
  }

  ionViewDidEnter(): void {
    this.pageActive = true;
    // Al volver a la página el contenedor puede haberse recreado o venir con ancho 0:
    // se reconcilia el observador y se recalcula con el ancho que haya ahora.
    this.masonry.observe();
    this.scheduleMasonryLayout();
    this.syncOverlayStack();
  }

  ionViewWillLeave(): void {
    this.pageActive = false;
    this.helpOpen = false;
    this.pendingAction = null;
    this.pendingActionOpener = null;
    this.overlayStack.unregisterOwner('archive');
  }

  ngDoCheck(): void {
    if (this.pageActive) this.syncOverlayStack();
  }

  private syncOverlayStack(): void {
    const overlays: RegisteredOverlay[] = [];
    if (this.pendingAction) {
      overlays.push({ id: 'archive:delete-confirm', close: () => this.cancelPendingAction() });
    }
    if (this.helpOpen) {
      overlays.push({ id: 'archive:help', close: () => this.closeHelp() });
    }
    this.overlayStack.sync('archive', overlays);
  }

  ngOnDestroy(): void {
    this.pageActive = false;
    this.overlayStack.unregisterOwner('archive');
    this.mobilePresentationQuery?.removeEventListener('change', this.onMobilePresentationChange);
    this.mobilePresentationQuery = null;
    this.subscription?.unsubscribe();
    this.masonry.disconnect();
    this.helpOpen = false;
  }

  private initializeMobilePresentation(): void {
    this.mobilePresentationQuery = window.matchMedia('(max-width: 700px)');
    this.isMobilePresentation = this.mobilePresentationQuery.matches;
    this.mobilePresentationQuery.addEventListener('change', this.onMobilePresentationChange);
  }

  /**
   * Escape cierra el diálogo que esté abierto. Los dos nunca se muestran a la vez, así que
   * basta con cerrar la ayuda si es lo que hay abierto y si no, la confirmación de borrado,
   * igual que en el tablero y el basurero.
   */
  @HostListener('document:keydown.escape')
  closeOpenDialogOnEscape(): void {
    if (!this.pageActive) return;
    if (this.helpOpen) {
      this.closeHelp();
      return;
    }
    this.cancelPendingAction();
  }

  // ── Ayuda del archivo ─────────────────────────────────────────────────────

  /**
   * Abre la guía del archivo. Solo tiene sentido con listas archivadas: si no hay ninguna,
   * el estado vacío ya muestra su propia tarjeta de ayuda y el botón ni siquiera existe.
   *
   * Al abrir se cierra la confirmación de borrado, para que nunca haya dos diálogos encima.
   */
  openHelp(): void {
    if (this.isEmpty) return;
    this.cancelPendingAction(false);
    this.helpOpen = true;
    // El foco entra en el modal (no en la página de detrás) y se queda dentro.
    afterNextRender(() => this.helpPrimary?.nativeElement.focus(), { injector: this.injector });
  }

  /**
   * Cierra la guía y devuelve el foco al botón de la banda, que es quien la abrió.
   * No hace nada si ya estaba cerrada, así que repetir la llamada es inofensivo.
   */
  closeHelp(): void {
    if (!this.helpOpen) return;
    this.helpOpen = false;
    const boton = this.helpButton;
    afterNextRender(() => boton?.nativeElement.focus(), { injector: this.injector });
  }

  /**
   * Mantiene el foco dentro del modal: al tabular, si se sale por detrás, vuelve al primer
   * control. Hay pocos controles (X y "Entendido"), así que basta con el borde del ciclo.
   */
  keepFocusInHelp(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const dialog = this.helpDialog?.nativeElement;
    if (!dialog) return;
    const controles = dialog.querySelectorAll<HTMLElement>('button:not([disabled])');
    if (controles.length === 0) return;
    const primero = controles[0];
    const ultimo = controles[controles.length - 1];
    const activo = document.activeElement;
    if (event.shiftKey ? activo === primero : activo === ultimo) {
      event.preventDefault();
      (event.shiftKey ? ultimo : primero).focus();
    }
  }

  /**
   * Cierra la guía si ya no queda ninguna lista archivada. Se llama tras cualquier cambio
   * que pueda vaciar el archivo (purga, restauración, borrado o sincronización), para que el
   * modal no siga abierto explicando listas que ya no existen. No devuelve el foco al
   * botón porque ese botón también ha desaparecido.
   */
  private syncHelpVisibility(): void {
    if (this.helpOpen && this.isEmpty) this.helpOpen = false;
  }

  /**
   * La cuenta atrás se recalcula al volver a primer plano. Al ir por días, solo cambia al
   * cruzar un día entero: no hace falta un temporizador por tarjeta, y al abrir la pantalla
   * las tarjetas ya se pintan con el momento actual.
   */
  @HostListener('document:visibilitychange')
  @HostListener('window:focus')
  refreshCountdown(): void {
    this.now = new Date();
    // Al cruzar el día de expiración, la lista se borra sola y los badges se recalculan.
    if (purgeExpiredArchivedLists(this.board, this.now)) {
      this.syncHelpVisibility();
      this.scheduleMasonryLayout();
      void this.persist();
    }
  }

  /**
   * Botón "Volver a mi tablero" del estado vacío y flecha del encabezado.
   *
   * navigateBack saca la página del stack del router outlet, de modo que la transición es
   * de retroceso. Si la página se abrió directamente en /archive no hay historial que
   * deshacer y cae a esa misma ruta hacia adelante.
   */
  goBack(): void {
    void this.navController.navigateBack('/board');
  }

  private async loadArchive(): Promise<void> {
    try {
      if (this.auth.enabled && !this.auth.session) {
        await this.router.navigateByUrl('/login', { replaceUrl: true });
        return;
      }
      this.subscription = (await this.session.open()).subscribe((board) => this.applyBoard(board));
    } catch (error) {
      console.error('No se pudo cargar el archivo', error);
      this.loadError = 'No se pudo cargar el archivo desde la nube. Comprueba la conexión y la configuración de Supabase.';
    } finally {
      this.loading = false;
    }
  }

  private applyBoard(board: ChecklistBoard): void {
    this.now = new Date();
    const purged = purgeExpiredArchivedLists(board, this.now);
    this.board = board;
    // Una sincronización puede dejar el archivo vacío; la guía no sobrevive a eso.
    this.syncHelpVisibility();
    this.scheduleMasonryLayout();
    // La rejilla se pinta en el siguiente ciclo: se reintenta por si el contenedor
    // acababa de aparecer y el observador todavía no lo tenía.
    setTimeout(() => {
      this.masonry.observe();
      this.scheduleMasonryLayout();
    });
    // Sin este guardado, una lista vencida reaparece al volver a entrar.
    if (purged) void this.persist();
  }

  // ── Tareas y progreso (solo lectura) ──────────────────────────────────────

  pendingTasks(list: ChecklistList): ChecklistTask[] {
    return pendingTasks(list);
  }

  completedTasks(list: ChecklistList): ChecklistTask[] {
    return completedTasks(list);
  }

  completedTaskCount(list: ChecklistList): number {
    return completedTaskCount(list);
  }

  listProgressPercent(list: ChecklistList): number {
    return listProgressPercent(list);
  }

  isListComplete(list: ChecklistList): boolean {
    return isListComplete(list);
  }

  taskCounterLabel(list: ChecklistList): string {
    return taskCounterLabel(list);
  }

  isCollapsed(listId: string): boolean {
    return this.collapsed.has(listId);
  }

  toggleCollapsed(listId: string): void {
    if (this.collapsed.has(listId)) this.collapsed.delete(listId);
    else this.collapsed.add(listId);
    this.scheduleMasonryLayout();
  }

  // ── Cuenta atrás ──────────────────────────────────────────────────────────

  /** Días que faltan; nunca 0 porque la lista se purga apenas llega a ese punto. */
  daysLeft(entry: ChecklistArchivedList): number {
    return diasRestantesSeguro(archiveDaysLeft(entry.archivedAt, this.now));
  }

  countdownLabel(entry: ChecklistArchivedList): string {
    return countdownLabel(this.daysLeft(entry));
  }

  /** Clase de urgencia del badge: gris → ámbar → rojo. */
  urgencyClass(entry: ChecklistArchivedList): string {
    return claseUrgencia(archiveUrgency(archiveDaysLeft(entry.archivedAt, this.now)));
  }

  /** En los 3 últimos días la lista completa se tiñe de rojo. */
  isUrgent(entry: ChecklistArchivedList): boolean {
    return esUrgente(archiveUrgency(archiveDaysLeft(entry.archivedAt, this.now)));
  }

  // ── Acciones ─────────────────────────────────────────────────────────────

  /**
   * Devuelve la lista al final del tablero conservando sus tareas y su estado.
   *
   * Si el tablero ya tiene el máximo de listas no se mueve nada y se avisa: es preferible
   * explicar el motivo a dejar el botón en gris sin explicación. La lista se queda en el
   * archivo, así que no se pierde nada y se puede reintentar al liberar una lista.
   */
  async restore(entry: ChecklistArchivedList): Promise<void> {
    this.restoreError = '';
    if (!restaurarDesdeArchivo(this.board, entry)) {
      this.restoreError = listLimitRestoreMessage();
      return;
    }
    this.collapsed.delete(entry.list.id);
    this.syncHelpVisibility();
    this.scheduleMasonryLayout();
    await this.persist();
  }

  /** El botón sigue siendo pulsable para poder explicar el bloqueo, pero avisa del límite. */
  get restoreBlockedHint(): string {
    return listLimitRestoreMessage();
  }

  requestDelete(entry: ChecklistArchivedList, event?: Event): void {
    this.restoreError = '';
    const opener = event?.currentTarget;
    this.pendingActionOpener = opener instanceof HTMLElement ? opener : null;
    this.pendingAction = { kind: 'delete', entry };
  }

  cancelPendingAction(restoreFocus = true): void {
    this.pendingAction = null;
    const opener = this.pendingActionOpener;
    this.pendingActionOpener = null;
    if (restoreFocus) afterNextRender(() => opener?.isConnected && opener.focus(), { injector: this.injector });
  }

  /**
   * Eliminar desde el archivo es definitivo: la lista y sus tareas desaparecen sin pasar
   * por el basurero, así que el diálogo avisa de que no se puede deshacer.
   */
  async confirmPendingAction(): Promise<void> {
    const action = this.pendingAction;
    if (!action) return;
    this.pendingAction = null;
    this.pendingActionOpener = null;
    this.collapsed.delete(action.entry.list.id);
    eliminarDelArchivo(this.board, action.entry);
    this.syncHelpVisibility();
    this.scheduleMasonryLayout();
    await this.persist();
  }

  keepFocusInConfirmation(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const dialog = event.currentTarget as HTMLElement;
    const items = dialog.querySelectorAll<HTMLElement>('button:not([disabled])');
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  get confirmTitle(): string {
    return '¿Eliminar definitivamente?';
  }

  get confirmMessage(): string {
    return 'Esta lista y todas sus tareas se eliminarán de forma permanente. Esta acción no se puede deshacer.';
  }

  get confirmListTitle(): string {
    return this.pendingAction?.entry.list.title ?? '';
  }

  private async persist(): Promise<void> {
    this.busy = true;
    this.saveError = '';
    try {
      await this.session.save(this.board);
    } catch (error) {
      console.error('No se pudo guardar el archivo', error);
      this.saveError = 'No se pudieron guardar los cambios en la nube. Revisa tu conexión e inténtalo de nuevo.';
    } finally {
      this.busy = false;
    }
  }
}
