import { CommonModule } from '@angular/common';
import { Component, HostBinding, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonRippleEffect, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBack, arrowUndoOutline, checkmark, chevronBack, chevronDown, chevronForward,
  timeOutline, trash, trashBinOutline
} from 'ionicons/icons';
import { Subscription } from 'rxjs';
import { ChecklistBoard, ChecklistList, ChecklistTask, ChecklistTrashedList } from '../../models/board.models';
import { DEFAULT_BOARD_THEME, readStoredTheme } from '../../core/board-themes';
import { countdownLabel, daysLeft, purgeExpiredLists, TRASH_RETENTION_DAYS, trashUrgency } from '../../core/trash';
import { AuthService } from '../../core/services/auth.service';
import { BoardSessionService } from '../../core/services/board-session.service';

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
export class TrashPage implements OnInit, OnDestroy {
  private readonly session = inject(BoardSessionService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private subscription?: Subscription;
  private countdownTimer?: ReturnType<typeof setInterval>;

  board: ChecklistBoard = {
    id: '', title: '', createdAt: new Date().toISOString(), lists: [], trashedLists: []
  };
  loading = true;
  loadError = '';
  saveError = '';
  busy = false;
  collapsed = new Set<string>();
  /** Estado solo visual del toggle de completadas; en el basurero no se persiste. */
  expandedCompleted = new Set<string>();
  pendingAction: PendingAction | null = null;

  /** Mismo límite de vista previa que usa el tablero. */
  private readonly COMPLETED_PREVIEW_LIMIT = 2;

  @HostBinding('style.--board-bg') boardBackground = DEFAULT_BOARD_THEME.background;

  /** Cinta informativa: el número sale de la misma constante que usa la cuenta atrás. */
  readonly retentionNotice = `Las listas descartadas al basurero son eliminadas después de ${TRASH_RETENTION_DAYS} días`;

  /**
   * Del descartado más reciente al más antiguo. Como el orden lo fija la fecha y no el
   * usuario, en el basurero no tiene sentido arrastrar para reordenar.
   */
  get trashedLists(): ChecklistTrashedList[] {
    return [...(this.board.trashedLists ?? [])].sort(
      (a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()
    );
  }

  get isEmpty(): boolean {
    return this.trashedLists.length === 0;
  }

  constructor() {
    addIcons({
      arrowBack, arrowUndoOutline, checkmark, chevronBack, chevronDown, chevronForward,
      timeOutline, trash, trashBinOutline
    });
  }

  ngOnInit(): void {
    void this.loadTrash();
    // Nada se restaura solo, pero la cuenta atrás tiene que refrescar para ponerse
    // roja al llegar el último día.
    this.countdownTimer = setInterval(() => this.refreshCountdown(), COUNTDOWN_REFRESH_MS);
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    if (this.countdownTimer) clearInterval(this.countdownTimer);
  }

  /** Escape cierra el diálogo de confirmación, igual que en el tablero. */
  @HostListener('document:keydown.escape')
  cancelPendingOnEscape(): void {
    this.pendingAction = null;
  }

  /** Botón "Volver a mi tablero" del estado vacío y flecha del encabezado. */
  goBack(): void {
    void this.router.navigateByUrl('/board');
  }

  private async loadTrash(): Promise<void> {
    // Reutiliza el color de tablero elegido en el menú de perfil.
    this.boardBackground = readStoredTheme(this.auth.session?.user.id ?? null).background;
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
    // Sin este guardado, una lista vencida reaparece al volver a entrar.
    if (purged) void this.persist();
  }

  /** Al cruzar el día de expiración, la lista se borra sola y los badges se recalculan. */
  private refreshCountdown(): void {
    if (purgeExpiredLists(this.board)) void this.persist();
  }

  // ── Tareas y progreso (solo lectura) ──────────────────────────────────────

  pendingTasks(list: ChecklistList): ChecklistTask[] {
    return list.tasks.filter((task) => !task.completed).sort((a, b) => a.position - b.position);
  }

  completedTasks(list: ChecklistList): ChecklistTask[] {
    return list.tasks.filter((task) => task.completed).sort((a, b) => a.position - b.position);
  }

  /**
   * Igual que en el tablero: se muestran las 2 primeras completadas y el resto queda
   * detrás del toggle. Es solo vista, por eso el estado no se guarda en el tablero.
   */
  visibleCompletedTasks(list: ChecklistList): ChecklistTask[] {
    const completed = this.completedTasks(list);
    if (this.isCompletedExpanded(list.id) || completed.length <= this.COMPLETED_PREVIEW_LIMIT) {
      return completed;
    }
    return completed.slice(0, this.COMPLETED_PREVIEW_LIMIT);
  }

  hiddenCompletedCount(list: ChecklistList): number {
    return Math.max(0, this.completedTasks(list).length - this.COMPLETED_PREVIEW_LIMIT);
  }

  shouldShowCompletedToggle(list: ChecklistList): boolean {
    return this.completedTasks(list).length > this.COMPLETED_PREVIEW_LIMIT;
  }

  isCompletedExpanded(listId: string): boolean {
    return this.expandedCompleted.has(listId);
  }

  toggleCompletedTasks(listId: string): void {
    if (this.expandedCompleted.has(listId)) this.expandedCompleted.delete(listId);
    else this.expandedCompleted.add(listId);
  }

  completedTaskCount(list: ChecklistList): number {
    return list.tasks.reduce((count, task) => count + Number(task.completed), 0);
  }

  listProgressPercent(list: ChecklistList): number {
    if (!list.tasks.length) return 0;
    return Math.round((this.completedTaskCount(list) / list.tasks.length) * 100);
  }

  isListComplete(list: ChecklistList): boolean {
    return list.tasks.length > 0 && this.completedTaskCount(list) === list.tasks.length;
  }

  taskCounterLabel(list: ChecklistList): string {
    if (this.isListComplete(list)) return '100% Hecho';
    return `${this.completedTaskCount(list)}/${list.tasks.length}`;
  }

  isCollapsed(listId: string): boolean {
    return this.collapsed.has(listId);
  }

  toggleCollapsed(listId: string): void {
    if (this.collapsed.has(listId)) this.collapsed.delete(listId);
    else this.collapsed.add(listId);
  }

  // ── Cuenta atrás ──────────────────────────────────────────────────────────

  /** Días que faltan; nunca 0 porque la lista se purga apenas llega a ese punto. */
  daysLeft(entry: ChecklistTrashedList): number {
    return Math.max(daysLeft(entry.deletedAt), 1);
  }

  countdownLabel(entry: ChecklistTrashedList): string {
    return countdownLabel(this.daysLeft(entry));
  }

  /** Clase de urgencia del badge: gris → ámbar → rojo. */
  urgencyClass(entry: ChecklistTrashedList): string {
    return `countdown-${trashUrgency(daysLeft(entry.deletedAt))}`;
  }

  /** En el último día la lista completa se tiñe de rojo. */
  isUrgent(entry: ChecklistTrashedList): boolean {
    return trashUrgency(daysLeft(entry.deletedAt)) === 'danger';
  }

  // ── Acciones ─────────────────────────────────────────────────────────────

  async restore(entry: ChecklistTrashedList): Promise<void> {
    const restored: ChecklistList = { ...entry.list, position: this.board.lists.length };
    this.board.lists = [...this.board.lists, restored];
    this.board.trashedLists = this.trashedLists.filter((item) => item.list.id !== entry.list.id);
    this.collapsed.delete(entry.list.id);
    await this.persist();
  }

  requestPurge(entry: ChecklistTrashedList): void {
    this.pendingAction = { kind: 'purge', entry };
  }

  requestEmptyTrash(): void {
    if (this.isEmpty) return;
    this.pendingAction = { kind: 'empty' };
  }

  cancelPendingAction(): void {
    this.pendingAction = null;
  }

  async confirmPendingAction(): Promise<void> {
    const action = this.pendingAction;
    if (!action) return;
    this.pendingAction = null;
    if (action.kind === 'empty') {
      this.collapsed.clear();
      this.board.trashedLists = [];
    } else {
      this.collapsed.delete(action.entry.list.id);
      this.board.trashedLists = this.trashedLists.filter((item) => item.list.id !== action.entry.list.id);
    }
    await this.persist();
  }

  // El texto del diálogo se resuelve aquí para no repetir condiciones en el template.
  get confirmTitle(): string {
    return this.pendingAction?.kind === 'empty' ? '¿Vaciar el basurero?' : '¿Eliminar permanentemente?';
  }

  get confirmMessage(): string {
    if (this.pendingAction?.kind === 'empty') {
      return `Se eliminarán las ${this.trashedLists.length} listas del basurero con todas sus tareas. Esta acción no se puede deshacer.`;
    }
    return 'Esta lista y todas sus tareas se eliminarán de forma definitiva. Esta acción no se puede deshacer.';
  }

  get confirmListTitle(): string {
    return this.pendingAction?.kind === 'purge' ? this.pendingAction.entry.list.title : '';
  }

  get confirmActionLabel(): string {
    return this.pendingAction?.kind === 'empty' ? 'Vaciar basurero' : 'Eliminar permanentemente';
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