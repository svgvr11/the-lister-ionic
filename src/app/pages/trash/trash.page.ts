import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  DoCheck,
  ElementRef,
  HostBinding,
  HostListener,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren,
  inject
} from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonRippleEffect, IonToolbar, NavController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBack, arrowUndoOutline, checkmark, chevronBack, chevronDown, chevronForward,
  timeOutline, trash, trashBinOutline
} from 'ionicons/icons';
import { Subscription } from 'rxjs';
import { ChecklistBoard, ChecklistList, ChecklistTask, ChecklistTrashedList } from '../../models/board.model';
import { readStoredTheme } from '../../core/board-themes';
import { countdownLabel, daysLeft, purgeExpiredLists, TRASH_RETENTION_DAYS, trashUrgency } from '../../core/list/trash/trash';
import { isListComplete, listLimitRestoreMessage } from '../../core/list/list-retention/list-retention';
import {
  claseUrgencia,
  diasRestantesSeguro,
  eliminarDelBasurero,
  esUrgente,
  ordenarEntradasPorFecha,
  restaurarDesdeBasurero,
  textosAccionBasurero,
  vaciarBasurero
} from '../../core/board-retention-page-rules';
import {
  completedTasks,
  hiddenCompletedCount,
  pendingTasks,
  shouldShowCompletedToggle,
  visibleCompletedTasks
} from '../../core/board-task-rules';
import {
  completedTaskCount,
  listProgressPercent,
  taskCounterLabel
} from '../../core/board-list-rules';
import { MAX_LIST_TITLE_LENGTH, normalizeListTitle } from '../../core/platform/limits/limits';
import { MasonryController, MASONRY_GAP } from '../../core/ui/masonry-layout/masonry-layout';
import { AuthService } from '../../services/auth.service';
import { BoardSessionService } from '../../services/board-session.service';
import { OverlayStackService, RegisteredOverlay } from '../../services/overlay-stack.service';

/** Acción destructiva pendiente de confirmar en el diálogo del basurero. */
type PendingAction = { kind: 'purge'; entry: ChecklistTrashedList } | { kind: 'empty' };

/** La cuenta atrás va en días, pero refrescarla cada minuto alcanza para el cambio de color. */
const COUNTDOWN_REFRESH_MS = 60_000;

/**
 * Basurero de listas: muestra las descartadas con los días que les quedan antes de
 * eliminarse de forma permanente, y permite restaurarlas o borrarlas definitivamente.
 */
@Component({
  selector: 'app-trash',
  standalone: true,
  imports: [CommonModule, IonContent, IonHeader, IonIcon, IonRippleEffect, IonToolbar],
  templateUrl: './trash.page.html',
  styleUrls: ['./trash.page.scss']
})
export class TrashPage implements OnInit, AfterViewInit, OnDestroy, DoCheck {
  private readonly session = inject(BoardSessionService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly navController = inject(NavController);
  private readonly overlayStack = inject(OverlayStackService);
  private subscription?: Subscription;
  private countdownTimer?: ReturnType<typeof setInterval>;
  private pageActive = false;

  board: ChecklistBoard = {
    id: '', title: '', createdAt: new Date().toISOString(), lists: [], trashedLists: []
  };
  loading = true;
  loadError = '';
  saveError = '';
  /** Aviso del límite de 50 listas al pulsar "Restaurar lista"; la lista no se mueve. */
  restoreError = '';
  busy = false;
  collapsed = new Set<string>();
  /** Estado solo visual del toggle de completadas; en el basurero no se persiste. */
  expandedCompleted = new Set<string>();
  pendingAction: PendingAction | null = null;
  private pendingActionOpener: HTMLElement | null = null;

  /**
   * Rejilla del basurero. Se declara con setter a propósito: el contenedor vive bajo un
   * `*ngIf`, así que se crea y se destruye en caliente. El setter es el aviso fiable para
   * atar el observador al nodo vivo (y soltarlo cuando desaparece), que es justo lo que
   * faltaba para que el masonry se readaptara al cambiar el ancho de la ventana.
   */
  @ViewChild('trashGrid', { read: ElementRef, static: false })
  private set trashGrid(ref: ElementRef<HTMLElement> | undefined) {
    this.trashGridElement = ref?.nativeElement ?? null;
    if (this.trashGridElement) {
      this.masonry.observe(this.trashGridElement);
      this.scheduleMasonryLayout();
    } else {
      this.masonry.release();
    }
  }
  private trashGridElement: HTMLElement | null = null;

  @ViewChildren('trashCard', { read: ElementRef })
  private trashCards!: QueryList<ElementRef<HTMLElement>>;

  @ViewChild('trashConfirmCancel', { read: ElementRef })
  private set trashConfirmCancel(button: ElementRef<HTMLButtonElement> | undefined) {
    if (button) requestAnimationFrame(() => button.nativeElement.focus());
  }

  private mobilePresentationQuery: MediaQueryList | null = null;
  private isMobilePresentation = false;
  /**
   * Ciclo de vida del masonry. Observa la rejilla y recalcula en vivo cuando cambia el
   * ancho del contenedor (ventana, zoom, rotación o barra de scroll).
   */
  private readonly masonry = new MasonryController({
    gap: MASONRY_GAP,
    getContainer: () => this.trashGridElement,
    getItems: () => this.trashCards?.toArray().map((item) => item.nativeElement) ?? []
  });
  private readonly onMobilePresentationChange = (event: MediaQueryListEvent): void => {
    this.isMobilePresentation = event.matches;
    this.scheduleMasonryLayout();
  };

  /** Mismo límite de vista previa que usa el tablero. */
  private readonly COMPLETED_PREVIEW_LIMIT = 2;

  /**
   * Reutiliza el color elegido en el menú de perfil de este dispositivo. Se lee al
   * construir la pantalla y solo de la caché local, para que el primer pintado no salga
   * con otro color.
   */
  @HostBinding('style.--board-bg') boardBackground = readStoredTheme().background;

  /** Cinta informativa: el número sale de la misma constante que usa la cuenta atrás. */
  readonly retentionNotice = `Las listas descartadas al basurero son eliminadas después de ${TRASH_RETENTION_DAYS} días`;

  /**
   * Del descartado más reciente al más antiguo. Como el orden lo fija la fecha y no el
   * usuario, en el basurero no tiene sentido arrastrar para reordenar.
   */
  get trashedLists(): ChecklistTrashedList[] {
    return ordenarEntradasPorFecha(this.board.trashedLists ?? [], (entry) => entry.deletedAt);
  }

  get isEmpty(): boolean {
    return this.trashedLists.length === 0;
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

  trackByEntryId(_: number, entry: ChecklistTrashedList): string {
    return entry.list.id;
  }

  constructor() {
    addIcons({
      arrowBack, arrowUndoOutline, checkmark, chevronBack, chevronDown, chevronForward,
      timeOutline, trash, trashBinOutline
    });
  }

  ngOnInit(): void {
    this.initializeMobilePresentation();
    void this.loadTrash();
    // Nada se restaura solo, pero la cuenta atrás tiene que refrescar para ponerse
    // roja al llegar el último día.
    this.countdownTimer = setInterval(() => this.refreshCountdown(), COUNTDOWN_REFRESH_MS);
  }

  ngAfterViewInit(): void {
    this.trashCards.changes.subscribe(() => this.scheduleMasonryLayout());
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
    this.pendingAction = null;
    this.pendingActionOpener = null;
    this.overlayStack.unregisterOwner('trash');
  }

  ngDoCheck(): void {
    if (this.pageActive) this.syncOverlayStack();
  }

  private syncOverlayStack(): void {
    const overlays: RegisteredOverlay[] = [];
    if (this.pendingAction) {
      overlays.push({ id: 'trash:confirm-action', close: () => this.cancelPendingAction() });
    }
    this.overlayStack.sync('trash', overlays);
  }

  ngOnDestroy(): void {
    this.pageActive = false;
    this.overlayStack.unregisterOwner('trash');
    this.mobilePresentationQuery?.removeEventListener('change', this.onMobilePresentationChange);
    this.mobilePresentationQuery = null;
    this.subscription?.unsubscribe();
    this.masonry.disconnect();
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }

  private initializeMobilePresentation(): void {
    this.mobilePresentationQuery = window.matchMedia('(max-width: 700px)');
    this.isMobilePresentation = this.mobilePresentationQuery.matches;
    this.mobilePresentationQuery.addEventListener('change', this.onMobilePresentationChange);
  }

  /** Escape cierra el diálogo de confirmación, igual que en el tablero. */
  @HostListener('document:keydown.escape')
  cancelPendingOnEscape(): void {
    if (!this.pageActive) return;
    this.cancelPendingAction();
  }

  /**
   * Botón "Volver a mi tablero" del estado vacío y flecha del encabezado.
   *
   * navigateBack saca la página del stack del router outlet, de modo que la
   * transición es de retroceso. Si la página se abrió directamente en /trash
   * no hay historial que deshacer y cae a esa misma ruta hacia adelante.
   */
  goBack(): void {
    void this.navController.navigateBack('/board');
  }

  private async loadTrash(): Promise<void> {
    try {
      if (this.auth.enabled && !this.auth.session) {
        await this.router.navigateByUrl('/login', { replaceUrl: true });
        return;
      }
      this.subscription = (await this.session.open()).subscribe((board) => this.applyBoard(board));
    } catch (error) {
      console.error('No se pudo cargar el basurero', error);
      this.loadError = 'No se pudo cargar el basurero desde la nube. Comprueba la conexión y la configuración de Supabase.';
    } finally {
      this.loading = false;
    }
  }

  private applyBoard(board: ChecklistBoard): void {
    const purged = purgeExpiredLists(board);
    this.board = board;
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

  /** Al cruzar el día de expiración, la lista se borra sola y los badges se recalculan. */
  private refreshCountdown(): void {
    if (purgeExpiredLists(this.board)) {
      this.scheduleMasonryLayout();
      void this.persist();
    }
  }

  // ── Tareas y progreso (solo lectura) ──────────────────────────────────────

  pendingTasks(list: ChecklistList): ChecklistTask[] {
    return pendingTasks(list);
  }

  completedTasks(list: ChecklistList): ChecklistTask[] {
    return completedTasks(list);
  }

  /**
   * Igual que en el tablero: se muestran las 2 primeras completadas y el resto queda
   * detrás del toggle. Es solo vista, por eso el estado no se guarda en el tablero.
   */
  visibleCompletedTasks(list: ChecklistList): ChecklistTask[] {
    return visibleCompletedTasks(list, this.isCompletedExpanded(list.id));
  }

  hiddenCompletedCount(list: ChecklistList): number {
    return hiddenCompletedCount(list);
  }

  shouldShowCompletedToggle(list: ChecklistList): boolean {
    return shouldShowCompletedToggle(list);
  }

  isCompletedExpanded(listId: string): boolean {
    return this.expandedCompleted.has(listId);
  }

  toggleCompletedTasks(listId: string): void {
    if (this.expandedCompleted.has(listId)) this.expandedCompleted.delete(listId);
    else this.expandedCompleted.add(listId);
    this.scheduleMasonryLayout();
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
  daysLeft(entry: ChecklistTrashedList): number {
    return diasRestantesSeguro(daysLeft(entry.deletedAt));
  }

  countdownLabel(entry: ChecklistTrashedList): string {
    return countdownLabel(this.daysLeft(entry));
  }

  /** Clase de urgencia del badge: gris → ámbar → rojo. */
  urgencyClass(entry: ChecklistTrashedList): string {
    return claseUrgencia(trashUrgency(daysLeft(entry.deletedAt)));
  }

  /** En el último día la lista completa se tiñe de rojo. */
  isUrgent(entry: ChecklistTrashedList): boolean {
    return esUrgente(trashUrgency(daysLeft(entry.deletedAt)));
  }

  // ── Acciones ─────────────────────────────────────────────────────────────

  /**
   * Restaura la lista al final del tablero conservando sus tareas y su estado.
   *
   * Con el tablero ya en el límite de listas no se mueve nada y se avisa: es preferible
   * explicar el motivo a dejar el botón en gris sin explicación. La lista se queda en el
   * basurero, así que no se pierde nada y se puede reintentar al liberar una lista.
   */
  async restore(entry: ChecklistTrashedList): Promise<void> {
    this.restoreError = '';
    if (!restaurarDesdeBasurero(this.board, entry)) {
      this.restoreError = listLimitRestoreMessage();
      return;
    }
    this.collapsed.delete(entry.list.id);
    this.scheduleMasonryLayout();
    await this.persist();
  }

  /** El botón sigue siendo pulsable para poder explicar el bloqueo, pero avisa del límite. */
  get restoreBlockedHint(): string {
    return listLimitRestoreMessage();
  }

  requestPurge(entry: ChecklistTrashedList, event?: Event): void {
    this.restoreError = '';
    const opener = event?.currentTarget;
    this.pendingActionOpener = opener instanceof HTMLElement ? opener : null;
    this.pendingAction = { kind: 'purge', entry };
  }

  requestEmptyTrash(event?: Event): void {
    if (this.isEmpty) return;
    const opener = event?.currentTarget;
    this.pendingActionOpener = opener instanceof HTMLElement ? opener : null;
    this.pendingAction = { kind: 'empty' };
  }

  cancelPendingAction(restoreFocus = true): void {
    this.pendingAction = null;
    const opener = this.pendingActionOpener;
    this.pendingActionOpener = null;
    if (restoreFocus) requestAnimationFrame(() => opener?.isConnected && opener.focus());
  }

  async confirmPendingAction(): Promise<void> {
    const action = this.pendingAction;
    if (!action) return;
    this.pendingAction = null;
    this.pendingActionOpener = null;
    if (action.kind === 'empty') {
      this.collapsed.clear();
      vaciarBasurero(this.board);
    } else {
      this.collapsed.delete(action.entry.list.id);
      eliminarDelBasurero(this.board, action.entry);
    }
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

  // El texto del diálogo se resuelve aquí para no repetir condiciones en la template.
  private textosConfirmacion(): ReturnType<typeof textosAccionBasurero> | null {
    if (!this.pendingAction) return null;
    return textosAccionBasurero(
      this.pendingAction.kind === 'empty'
        ? { kind: 'empty', cantidad: this.trashedLists.length }
        : { kind: 'purge' }
    );
  }

  get confirmTitle(): string {
    return this.textosConfirmacion()?.title ?? '';
  }

  get confirmMessage(): string {
    return this.textosConfirmacion()?.message ?? '';
  }

  get confirmListTitle(): string {
    return this.pendingAction?.kind === 'purge' ? this.pendingAction.entry.list.title : '';
  }

  get confirmActionLabel(): string {
    return this.textosConfirmacion()?.actionLabel ?? '';
  }

  private async persist(): Promise<void> {
    this.busy = true;
    this.saveError = '';
    try {
      await this.session.save(this.board);
    } catch (error) {
      console.error('No se pudo guardar el basurero', error);
      this.saveError = 'No se pudieron guardar los cambios en la nube. Revisa tu conexión e inténtalo de nuevo.';
    } finally {
      this.busy = false;
    }
  }
}