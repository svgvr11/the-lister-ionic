import { CommonModule } from '@angular/common';
import { Component, HostBinding, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonRippleEffect, IonToolbar, NavController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  archiveOutline, arrowBack, arrowUndoOutline, checkmark, chevronBack, chevronDown, chevronForward,
  helpCircleOutline, timeOutline, trash
} from 'ionicons/icons';
import { Subscription } from 'rxjs';
import { ChecklistArchivedList, ChecklistBoard, ChecklistList, ChecklistTask } from '../../models/board.models';
import { readStoredTheme } from '../../core/board-themes';
import { AppFooterComponent } from '../../shared/app-footer/app-footer.component';
import {
  ARCHIVE_RETENTION_DAYS, archiveDaysLeft, archiveUrgency, countdownLabel, purgeExpiredArchivedLists
} from '../../core/archive';
import { listLimitRestoreMessage, restoreListToBoard } from '../../core/list-retention';
import { AuthService } from '../../core/services/auth.service';
import { BoardSessionService } from '../../core/services/board-session.service';

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
  imports: [CommonModule, IonContent, IonHeader, IonIcon, IonRippleEffect, IonToolbar, AppFooterComponent],
  templateUrl: './archive.page.html',
  styleUrls: ['./archive.page.scss']
})
export class ArchivePage implements OnInit, OnDestroy {
  private readonly session = inject(BoardSessionService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly navController = inject(NavController);
  private subscription?: Subscription;

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
   */
  @HostBinding('style.--board-bg') boardBackground = readStoredTheme().background;

  /** Cinta informativa: el número sale de la misma constante que usa la cuenta atrás. */
  readonly retentionNotice =
    `Las listas archivadas se conservan hasta ${ARCHIVE_RETENTION_DAYS} días y luego se eliminan de forma permanente.`;

  /** Texto de la tarjeta de ayuda, que solo se muestra cuando el archivo está vacío. */
  readonly helpText =
    'Al completar tus listas, puedes enviarlas al archivo para mantener limpio tu espacio de trabajo manteniendo acceso a trabajo terminado recientemente.';

  /**
   * De la lista archivada más reciente a la más antigua. El orden lo fija la fecha y no el
   * usuario, así que en el archivo no tiene sentido arrastrar para reordenar.
   */
  get archivedLists(): ChecklistArchivedList[] {
    return [...(this.board.archivedLists ?? [])].sort(
      (a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime()
    );
  }

  get isEmpty(): boolean {
    return this.archivedLists.length === 0;
  }

  constructor() {
    addIcons({
      archiveOutline, arrowBack, arrowUndoOutline, checkmark, chevronBack, chevronDown,
      chevronForward, helpCircleOutline, timeOutline, trash
    });
  }

  ngOnInit(): void {
    void this.loadArchive();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  /** Escape cierra el diálogo de confirmación, igual que en el tablero y el basurero. */
  @HostListener('document:keydown.escape')
  cancelPendingOnEscape(): void {
    this.pendingAction = null;
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
    if (purgeExpiredArchivedLists(this.board, this.now)) void this.persist();
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
    // Sin este guardado, una lista vencida reaparece al volver a entrar.
    if (purged) void this.persist();
  }

  // ── Tareas y progreso (solo lectura) ──────────────────────────────────────

  pendingTasks(list: ChecklistList): ChecklistTask[] {
    return list.tasks.filter((task) => !task.completed).sort((a, b) => a.position - b.position);
  }

  completedTasks(list: ChecklistList): ChecklistTask[] {
    return list.tasks.filter((task) => task.completed).sort((a, b) => a.position - b.position);
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
    return this.isListComplete(list) ? '100% Hecho' : `${this.completedTaskCount(list)}/${list.tasks.length}`;
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
  daysLeft(entry: ChecklistArchivedList): number {
    return Math.max(archiveDaysLeft(entry.archivedAt, this.now), 1);
  }

  countdownLabel(entry: ChecklistArchivedList): string {
    return countdownLabel(this.daysLeft(entry));
  }

  /** Clase de urgencia del badge: gris → ámbar → rojo. */
  urgencyClass(entry: ChecklistArchivedList): string {
    return `countdown-${archiveUrgency(archiveDaysLeft(entry.archivedAt, this.now))}`;
  }

  /** En los 3 últimos días la lista completa se tiñe de rojo. */
  isUrgent(entry: ChecklistArchivedList): boolean {
    return archiveUrgency(archiveDaysLeft(entry.archivedAt, this.now)) === 'danger';
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
    if (!restoreListToBoard(this.board, entry.list)) {
      this.restoreError = listLimitRestoreMessage();
      return;
    }
    this.board.archivedLists = this.archivedLists.filter((item) => item.list.id !== entry.list.id);
    this.collapsed.delete(entry.list.id);
    await this.persist();
  }

  /** El botón sigue siendo pulsable para poder explicar el bloqueo, pero avisa del límite. */
  get restoreBlockedHint(): string {
    return listLimitRestoreMessage();
  }

  requestDelete(entry: ChecklistArchivedList): void {
    this.restoreError = '';
    this.pendingAction = { kind: 'delete', entry };
  }

  cancelPendingAction(): void {
    this.pendingAction = null;
  }

  /**
   * Eliminar desde el archivo es definitivo: la lista y sus tareas desaparecen sin pasar
   * por el basurero, así que el diálogo avisa de que no se puede deshacer.
   */
  async confirmPendingAction(): Promise<void> {
    const action = this.pendingAction;
    if (!action) return;
    this.pendingAction = null;
    this.collapsed.delete(action.entry.list.id);
    this.board.archivedLists = this.archivedLists.filter((item) => item.list.id !== action.entry.list.id);
    await this.persist();
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
