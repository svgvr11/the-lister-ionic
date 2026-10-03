import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostBinding, HostListener, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonContent, IonHeader, IonIcon, IonInput, IonRippleEffect, IonTitle, IonToolbar
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  add, checkmark, chevronDown, chevronForward, close, logOut,
  trash, trashBinOutline, personCircle, layersOutline, search, pencil, checkmarkCircle, returnDownBack, reorderThree
} from 'ionicons/icons';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { ChecklistBoard, ChecklistList, ChecklistTask } from '../../models/board.models';
import { BoardTheme, BOARD_THEMES, DEFAULT_BOARD_THEME, readStoredTheme, storeTheme } from '../../core/board-themes';
import { purgeExpiredLists } from '../../core/trash';
import { AuthService } from '../../core/services/auth.service';
import { BoardSessionService } from '../../core/services/board-session.service';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [
    CommonModule, FormsModule, IonContent, IonHeader, IonIcon, IonInput, IonRippleEffect, IonTitle, IonToolbar
  ],
  templateUrl: './board.page.html',
  styleUrls: ['./board.page.scss']
})
export class BoardPage implements OnInit, OnDestroy, AfterViewInit {
  private readonly session = inject(BoardSessionService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private subscription?: Subscription;

  board: ChecklistBoard = {
    id: '', title: 'Cargando tablero...', createdAt: new Date().toISOString(), lists: []
  };
  loadingBoard = true;
  boardError = '';
  saveError = '';
  private readonly currentDate = new Date();
  readonly currentDateIso = [
    this.currentDate.getFullYear(),
    String(this.currentDate.getMonth() + 1).padStart(2, '0'),
    String(this.currentDate.getDate()).padStart(2, '0')
  ].join('-');
  readonly currentDateLabel = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(this.currentDate);
  currentUserName = '';
  currentUserEmail = '';
  currentUserAvatarUrl = '';
  readonly authEnabled = this.auth.enabled;
  readonly themes = BOARD_THEMES;
  activeTheme: BoardTheme = DEFAULT_BOARD_THEME;
  accountMenuOpen = false;
  readonly donationMessage = '!Me gusta la app!';
  readonly donationUrl = 'https://ko-fi.com/M4M62R6XT';

  get listProgress(): string {
    return `${Math.min(this.board.lists.length, 50) / 50 * 100}%`;
  }

  get isAtListLimit(): boolean {
    return this.board.lists.length >= 50;
  }

  @HostBinding('style.--board-bg') boardBackground = this.activeTheme.background;
  @HostBinding('style.--topbar-bg') toolbarBackground = this.activeTheme.toolbar;
  @HostBinding('style.--accent') themeAccent = this.activeTheme.accent;
  @HostBinding('style.--fab-color') themeFab = this.activeTheme.fab;
  @HostBinding('style.--fab-hover') themeFabHover = this.activeTheme.accent;
  collapsed = new Set<string>();
  expandedCompleted = new Set<string>();
  addingList = false;
  newListTitle = '';
  readonly visualColors = [
    { name: 'Índigo', value: '#5145e8' },
    { name: 'Menta', value: '#5be9b0' },
    { name: 'Celeste', value: '#d3defe' },
    { name: 'Coral', value: '#ffd4d0' },
    { name: 'Lavanda', value: '#cfd8ff' }
  ];
  selectedVisualColor = this.visualColors[0].value;
  placeNewListAtStart = false;
  taskDrafts: Record<string, string> = {};
  busy = false;

  searching = false;
  searchQuery = '';

  editingTitle = false;
  titleDraft = '';
  editingListId: string | null = null;
  listTitleDraft = '';
  editingTaskId: string | null = null;
  taskTextDraft = '';
  listToDelete: ChecklistList | null = null;

  private draggedTask: { listId: string; taskId: string } | null = null;

  @ViewChildren('boardItem', { read: ElementRef })
  private boardItems!: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('boardGrid', { read: ElementRef, static: false })
  private boardGrid?: ElementRef<HTMLElement>;
  private resizeObserver?: ResizeObserver;
  private layoutFrame: number | null = null;

  private readonly GAP = 22;
  private readonly COMPLETED_PREVIEW_LIMIT = 2;

  constructor() {
    addIcons({search,close,personCircle,checkmark,logOut,pencil,trash,trashBinOutline,reorderThree,add,layersOutline,returnDownBack,checkmarkCircle,chevronDown,chevronForward});
  }

  ngOnInit(): void {
    void this.initializeBoard();
  }

  private async initializeBoard(): Promise<void> {
    const session = this.auth.session;
    this.currentUserEmail = session?.user.email ?? '';
    const metadata = session?.user.user_metadata;
    this.currentUserName = String(metadata?.['full_name'] ?? metadata?.['name'] ?? metadata?.['given_name'] ?? this.currentUserEmail.split('@')[0]);
    this.currentUserAvatarUrl = String(metadata?.['avatar_url'] ?? metadata?.['picture'] ?? '');
    try {
      if (this.auth.enabled && !session) {
        await this.router.navigateByUrl('/login', { replaceUrl: true });
        return;
      }

      this.restoreTheme(session?.user.id ?? null);
      this.subscription = (await this.session.open()).subscribe((board) => this.applyBoard(board));
    } catch (error) {
      console.error('No se pudo cargar el tablero sincronizado', error);
      this.boardError = 'No se pudo cargar el tablero desde la nube. Comprueba la conexión y la configuración de Supabase.';
    } finally {
      this.loadingBoard = false;
    }
  }

  /** Publica el tablero recibido y descarta del basurero lo que ya cumplió los 7 días. */
  private applyBoard(board: ChecklistBoard): void {
    const purged = purgeExpiredLists(board);
    this.board = board;
    // Un tablero sin pin (guardado antes de esta función) recibe la primera lista.
    const pinnedChanged = this.syncPinnedList();
    // Los datos suelen llegar después de ngAfterViewInit (carga en la nube), así que
    // hay que observar y maquetar en cuanto se pinta la rejilla.
    this.observeBoardGrid();
    this.scheduleMasonryLayout();
    // Sin este guardado, una lista vencida o el pin inicial volverían a aparecer en el próximo inicio.
    if (purged || pinnedChanged) void this.persist();
  }

  toggleAccountMenu(): void {
    this.accountMenuOpen = !this.accountMenuOpen;
  }

  closeAccountMenu(): void {
    this.accountMenuOpen = false;
  }

  /** Aplica y persiste el tema. El menú de perfil sigue abierto para poder seguir probando colores. */
  selectTheme(theme: BoardTheme): void {
    this.activeTheme = theme;
    this.applyTheme(theme);
    storeTheme(this.auth.session?.user.id ?? null, theme);
  }

  /** Cierra el menú de perfil y abre la pantalla de basurero. */
  async openTrash(): Promise<void> {
    this.accountMenuOpen = false;
    await this.router.navigateByUrl('/trash');
  }

  async logout(): Promise<void> {
    this.accountMenuOpen = false;
    await this.auth.signOut();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  /** Escape cierra el menú de perfil, el panel de nueva lista y el diálogo de borrado. */
  @HostListener('document:keydown.escape')
  closeOverlaysOnEscape(): void {
    this.accountMenuOpen = false;
    this.cancelAddList();
    this.cancelDeleteList();
  }

  private restoreTheme(userId: string | null): void {
    const savedTheme = readStoredTheme(userId);
    this.activeTheme = savedTheme;
    this.applyTheme(savedTheme);
  }

  private applyTheme(theme: BoardTheme): void {
    this.boardBackground = theme.background;
    this.toolbarBackground = theme.toolbar;
    this.themeAccent = theme.accent;
    this.themeFab = theme.fab;
    this.themeFabHover = theme.accent;
  }

  ngAfterViewInit(): void {
    this.boardItems.changes.subscribe(() => this.scheduleMasonryLayout());
    this.observeBoardGrid();
    this.scheduleMasonryLayout();
  }

  /**
   * Conecta el ResizeObserver al contenedor del tablero. Se vuelve a llamar cada vez
   * que llegan datos porque, mientras la carga es asíncrona (Supabase), en ngAfterViewInit
   * el tablero todavía no existe y el observador nunca quedaría conectado.
   */
  private observeBoardGrid(): void {
    const board = this.boardGrid?.nativeElement;
    if (!board) return;
    this.resizeObserver ??= new ResizeObserver(() => this.scheduleMasonryLayout());
    this.resizeObserver.observe(board);
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.resizeObserver?.disconnect();
    if (this.layoutFrame !== null) cancelAnimationFrame(this.layoutFrame);
  }

  // ✏️ Edición de título
  startEditTitle(): void {
    this.titleDraft = this.board.title;
    this.editingTitle = true;
  }

  confirmEditTitle(): void {
    const newTitle = this.titleDraft.trim();
    if (!newTitle) {
      this.cancelEditTitle();
      return;
    }
    this.board.title = newTitle;
    this.editingTitle = false;
    this.persist();
  }

  cancelEditTitle(): void {
    this.editingTitle = false;
    this.titleDraft = '';
  }

  startEditList(list: ChecklistList, event: Event): void {
    event.stopPropagation();
    this.editingListId = list.id;
    this.listTitleDraft = list.title;
  }

  async confirmEditList(list: ChecklistList): Promise<void> {
    const title = this.listTitleDraft.trim();
    if (!title) {
      this.cancelEditList();
      return;
    }
    list.title = title;
    this.cancelEditList();
    await this.persist();
  }

  cancelEditList(): void {
    this.editingListId = null;
    this.listTitleDraft = '';
  }

  startEditTask(task: ChecklistTask, event: Event): void {
    event.stopPropagation();
    this.editingTaskId = task.id;
    this.taskTextDraft = task.text;
  }

  async confirmEditTask(task: ChecklistTask): Promise<void> {
    const text = this.taskTextDraft.trim();
    if (!text) {
      this.cancelEditTask();
      return;
    }
    task.text = text;
    this.cancelEditTask();
    await this.persist();
  }

  cancelEditTask(): void {
    this.editingTaskId = null;
    this.taskTextDraft = '';
  }

  isEditingTask(taskId: string): boolean {
    return this.editingTaskId === taskId;
  }

  // ✨ Toggle del panel FAB (en lugar de solo abrir)
  toggleAddList(): void {
    if (!this.addingList && this.isAtListLimit) return;
    this.addingList = !this.addingList;
    if (this.addingList) {
      this.newListTitle = '';
      this.selectedVisualColor = this.visualColors[0].value;
      this.placeNewListAtStart = false;
    }
  }

  // 🔍 Búsqueda
  toggleSearch(): void {
    this.searching = !this.searching;
    if (!this.searching) this.clearSearch();
  }

  closeSearch(): void {
    this.searching = false;
    this.clearSearch();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.scheduleMasonryLayout();
  }

  onSearchChange(): void {
    this.searching = Boolean(this.searchQuery.trim());
    this.scheduleMasonryLayout();
  }

  getHighlightedSegments(title: string): { text: string; highlight: boolean }[] {
    if (!this.searchQuery.trim()) return [{ text: title, highlight: false }];
    const query = this.searchQuery.toLowerCase();
    const lower = title.toLowerCase();
    const segments: { text: string; highlight: boolean }[] = [];
    let lastIdx = 0;
    let idx = lower.indexOf(query, lastIdx);
    while (idx !== -1) {
      if (idx > lastIdx) {
        segments.push({ text: title.slice(lastIdx, idx), highlight: false });
      }
      segments.push({
        text: title.slice(idx, idx + this.searchQuery.length),
        highlight: true
      });
      lastIdx = idx + this.searchQuery.length;
      idx = lower.indexOf(query, lastIdx);
    }
    if (lastIdx < title.length) {
      segments.push({ text: title.slice(lastIdx), highlight: false });
    }
    return segments;
  }

  get visibleLists(): ChecklistList[] {
    const lists = [...this.board.lists].sort((a, b) => a.position - b.position);
    // La lista pinneada va siempre en la primera posición de la rejilla (arriba a la izquierda).
    const pinned = lists.find((list) => list.id === this.board.pinnedListId);
    const ordered = pinned ? [pinned, ...lists.filter((list) => list.id !== pinned.id)] : lists;
    if (this.searching && this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      return ordered.filter((l) => l.title.toLowerCase().includes(q));
    }
    return ordered;
  }

  isPinned(list: ChecklistList): boolean {
    return this.board.pinnedListId === list.id;
  }

  /** Fija una lista al inicio del tablero, reemplazando a la que estaba pinneada. */
  async pinList(list: ChecklistList): Promise<void> {
    if (this.isPinned(list)) return;
    this.board.pinnedListId = list.id;
    await this.persist();
  }

  /**
   * Deja una sola lista pinneada. Si el pin apunta a una lista que ya no está en el
   * tablero (la acaba de descartar el usuario) o si el tablero aún no tenía ninguna,
   * la primera lista por posición asume el pin. Devuelve si hubo que corregirlo,
   * para avisar que el tablero debe guardarse.
   */
  private syncPinnedList(): boolean {
    const current = this.board.pinnedListId ?? null;
    const stillInBoard = current !== null && this.board.lists.some((list) => list.id === current);
    const first = [...this.board.lists].sort((a, b) => a.position - b.position)[0]?.id ?? null;
    const pinnedListId = stillInBoard ? current : first;
    if (pinnedListId === current) return false;
    this.board.pinnedListId = pinnedListId;
    return true;
  }

  pendingTasks(list: ChecklistList): ChecklistTask[] {
    return list.tasks.filter((task) => !task.completed).sort((a, b) => a.position - b.position);
  }

  completedTasks(list: ChecklistList): ChecklistTask[] {
    return list.tasks.filter((task) => task.completed).sort((a, b) => a.position - b.position);
  }

  isCompletedExpanded(listId: string): boolean {
    return this.expandedCompleted.has(listId);
  }

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

  toggleCompletedTasks(list: ChecklistList): void {
    if (this.expandedCompleted.has(list.id)) this.expandedCompleted.delete(list.id);
    else this.expandedCompleted.add(list.id);
    this.scheduleMasonryLayout();
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

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  async addTask(list: ChecklistList, input?: IonInput): Promise<void> {
    const text = (this.taskDrafts[list.id] ?? '').trim();
    if (!text) return;
    const maxPosition = list.tasks.reduce((max, task) => Math.max(max, task.position), -1);
    list.tasks.push({
      id: crypto.randomUUID(), listId: list.id, text, completed: false,
      position: maxPosition + 1, createdAt: new Date().toISOString()
    });
    this.taskDrafts[list.id] = '';
    // Mantener el foco en el input para poder añadir varias tareas seguidas.
    input?.setFocus();
    await this.persist();
  }

  async toggleTask(list: ChecklistList, task: ChecklistTask): Promise<void> {
    task.completed = !task.completed;
    this.reorderTasks(list);
    await this.persist();
  }

  async deleteTask(list: ChecklistList, taskId: string): Promise<void> {
    list.tasks = list.tasks.filter((task) => task.id !== taskId);
    this.reorderTasks(list);
    await this.persist();
  }

  /**
   * Descarta la lista al basurero en lugar de borrarla: queda guardada 7 días
   * y se puede restaurar desde la pantalla de Basurero.
   */
  async moveListToTrash(list: ChecklistList): Promise<void> {
    this.board.lists = this.board.lists.filter((item) => item.id !== list.id);
    this.board.trashedLists = [
      ...(this.board.trashedLists ?? []),
      { list: { ...list, tasks: [...list.tasks] }, deletedAt: new Date().toISOString() }
    ];
    this.collapsed.delete(list.id);
    this.expandedCompleted.delete(list.id);
    this.reorderLists();
    // Si se descartó la lista pinneada, el pin pasa a la siguiente del tablero.
    this.syncPinnedList();
    await this.persist();
  }

  requestDeleteList(list: ChecklistList): void {
    this.listToDelete = list;
  }

  cancelDeleteList(): void {
    this.listToDelete = null;
  }

  async confirmDeleteList(): Promise<void> {
    const list = this.listToDelete;
    if (!list) return;
    this.listToDelete = null;
    await this.moveListToTrash(list);
  }

  toggleCollapsed(listId: string): void {
    if (this.collapsed.has(listId)) this.collapsed.delete(listId);
    else this.collapsed.add(listId);
    this.scheduleMasonryLayout();
  }

  async addList(): Promise<void> {
    const title = this.newListTitle.trim();
    if (!title || this.isAtListLimit) return;
    const orderedLists = [...this.board.lists].sort((a, b) => a.position - b.position);
    const newList: ChecklistList = {
      id: crypto.randomUUID(),
      boardId: this.board.id,
      title,
      visualColor: this.selectedVisualColor,
      position: this.placeNewListAtStart ? 0 : orderedLists.length,
      createdAt: new Date().toISOString(),
      tasks: []
    };
    if (this.placeNewListAtStart) orderedLists.unshift(newList);
    else orderedLists.push(newList);
    orderedLists.forEach((list, index) => list.position = index);
    this.board.lists = orderedLists;
    // Una lista creada "al inicio del tablero" también arranca pinneada.
    if (this.placeNewListAtStart) this.board.pinnedListId = newList.id;
    this.newListTitle = '';
    this.addingList = false;
    await this.persist();
  }

  cancelAddList(): void {
    this.addingList = false;
    this.newListTitle = '';
  }

  startTaskDrag(listId: string, taskId: string, event: DragEvent): void {
    event.stopPropagation();
    this.draggedTask = { listId, taskId };
    event.dataTransfer?.setData('text/plain', `task:${taskId}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  dragOverTask(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  async dropTask(targetList: ChecklistList, targetTaskId: string, event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (!this.draggedTask || this.draggedTask.taskId === targetTaskId) return;
    const sourceList = this.board.lists.find((list) => list.id === this.draggedTask?.listId);
    if (!sourceList) return;
    sourceList.tasks = [...this.pendingTasks(sourceList), ...this.completedTasks(sourceList)];
    if (sourceList !== targetList) {
      targetList.tasks = [...this.pendingTasks(targetList), ...this.completedTasks(targetList)];
    }
    const sourceIndex = sourceList.tasks.findIndex((task) => task.id === this.draggedTask?.taskId);
    if (sourceIndex < 0) return;
    const [moved] = sourceList.tasks.splice(sourceIndex, 1);
    const targetIndex = targetList.tasks.findIndex((task) => task.id === targetTaskId);
    targetList.tasks.splice(Math.max(0, targetIndex), 0, moved);
    this.setTaskPositions(sourceList);
    if (sourceList !== targetList) this.setTaskPositions(targetList);
    this.draggedTask = null;
    await this.persist();
  }

  async dropTaskInList(targetList: ChecklistList, event: DragEvent): Promise<void> {
    event.preventDefault();
    if (!this.draggedTask) return;
    const sourceList = this.board.lists.find((list) => list.id === this.draggedTask?.listId);
    if (!sourceList) return;
    sourceList.tasks = [...this.pendingTasks(sourceList), ...this.completedTasks(sourceList)];
    if (sourceList !== targetList) {
      targetList.tasks = [...this.pendingTasks(targetList), ...this.completedTasks(targetList)];
    }
    const sourceIndex = sourceList.tasks.findIndex((task) => task.id === this.draggedTask?.taskId);
    if (sourceIndex < 0) return;
    const [moved] = sourceList.tasks.splice(sourceIndex, 1);
    targetList.tasks.push(moved);
    this.setTaskPositions(sourceList);
    if (sourceList !== targetList) this.setTaskPositions(targetList);
    this.draggedTask = null;
    await this.persist();
  }

  /** Las listas ya no se arrastran; solo queda el reordenamiento de tareas dentro de la lista. */
  clearTaskDragState(): void {
    this.draggedTask = null;
  }

  private scheduleMasonryLayout(): void {
    if (this.layoutFrame !== null) cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = null;
      this.applyMasonryLayout();
    });
  }

  private applyMasonryLayout(): void {
    const board = this.boardGrid?.nativeElement;
    const items = this.boardItems?.toArray().map((item) => item.nativeElement) ?? [];
    if (!board) return;
    if (items.length === 0) {
      board.style.height = '';
      return;
    }
    // Con ancho 0 la página está oculta o todavía sin maquetar (pasa al volver del
    // basurero). Grabar las posiciones con ancho 0 deja las tarjetas superpuestas y
    // nada las arregla después, así que se sale sin tocar nada: el ResizeObserver
    // reintenta en cuanto el contenedor recupera su tamaño.
    if (board.clientWidth === 0) return;

    const isMobile = window.matchMedia('(max-width: 700px)').matches;
    const columns = isMobile ? 1 : 3;
    const itemWidth = isMobile
      ? Math.min(board.clientWidth, 520)
      : Math.max(0, (board.clientWidth - this.GAP * (columns - 1)) / columns);
    const heights = new Array(columns).fill(0);

    board.style.position = 'relative';
    board.style.height = 'auto';

    items.forEach((item) => {
      item.style.position = 'absolute';
      item.style.width = `${itemWidth}px`;
      item.style.left = '0';
      item.style.top = '0';
    });

    void board.offsetHeight;

    items.forEach((item) => {
      const column = heights.indexOf(Math.min(...heights));
      const x = isMobile
        ? (board.clientWidth - itemWidth) / 2
        : column * (itemWidth + this.GAP);
      const y = heights[column];
      item.style.left = `${x}px`;
      item.style.top = `${y}px`;
      heights[column] = y + item.offsetHeight + this.GAP;
    });

    board.style.height = `${Math.max(...heights, 0)}px`;
  }

  private reorderLists(): void {
    [...this.board.lists]
      .sort((a, b) => a.position - b.position)
      .forEach((list, index) => list.position = index);
  }

  private reorderTasks(list: ChecklistList): void {
    const pending = list.tasks.filter((task) => !task.completed).sort((a, b) => a.position - b.position);
    const completed = list.tasks.filter((task) => task.completed).sort((a, b) => a.position - b.position);
    [...pending, ...completed].forEach((task, index) => task.position = index);
  }

  private setTaskPositions(list: ChecklistList): void {
    list.tasks.forEach((task, index) => task.position = index);
  }

  private async persist(): Promise<void> {
    this.busy = true;
    this.saveError = '';
    try {
      await this.session.save(this.board);
      this.scheduleMasonryLayout();
    } catch (error) {
      console.error('No se pudo guardar el tablero sincronizado', error);
      this.saveError = 'No se pudieron guardar los cambios en la nube. Revisa tu conexión e inténtalo de nuevo.';
    } finally {
      this.busy = false;
    }
  }
}