import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostBinding, HostListener, OnDestroy, OnInit, QueryList, ViewChildren, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonContent, IonHeader, IonIcon, IonInput, IonTitle, IonToolbar
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  add, checkmark, chevronDown, chevronForward, close, logOut,
  trash, personCircle, layersOutline, search, pencil, checkmarkCircle, returnDownBack, reorderThree } from 'ionicons/icons';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { ChecklistBoard, ChecklistList, ChecklistTask } from '../../models/board.models';
import { AuthService } from '../../core/services/auth.service';
import { BoardRepository } from '../../core/services/board.repository';
import { LocalBoardRepository } from '../../core/services/local-board.repository';
import { SupabaseBoardRepository } from '../../core/services/supabase-board.repository';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [
    CommonModule, FormsModule, IonContent, IonHeader, IonIcon, IonInput, IonTitle, IonToolbar
  ],
  templateUrl: './board.page.html',
  styleUrls: ['./board.page.scss']
})
export class BoardPage implements OnInit, OnDestroy, AfterViewInit {
  private readonly localRepository = inject(LocalBoardRepository);
  private readonly supabaseRepository = inject(SupabaseBoardRepository);
  private repository: BoardRepository = this.localRepository;
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
  readonly themes = [
    { id: 'lavender', name: 'Lavanda', background: '#eee8f8', toolbar: '#ddd2ef', accent: '#8870ad', fab: '#9780bb' },
    { id: 'sky', name: 'Celeste', background: '#e6f2fb', toolbar: '#d1e6f5', accent: '#5686ac', fab: '#739fbe' },
    { id: 'mint', name: 'Menta', background: '#e7f4ed', toolbar: '#d2e9dc', accent: '#52836a', fab: '#6a9b7f' },
    { id: 'rose', name: 'Rosa', background: '#f8e9ed', toolbar: '#f0d6df', accent: '#ac657e', fab: '#bf7e94' },
    { id: 'peach', name: 'Durazno', background: '#fbefe4', toolbar: '#f4dfca', accent: '#a8754e', fab: '#bd8c64' },
    { id: 'butter', name: 'Vainilla', background: '#f6f2da', toolbar: '#eae3b9', accent: '#928238', fab: '#b1a052' }
  ];
  activeTheme = this.themes[0];
  accountMenuOpen = false;

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
  placeNewListAtStart = true;
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

  private draggedListId: string | null = null;
  private draggedTask: { listId: string; taskId: string } | null = null;

  @ViewChildren('boardItem', { read: ElementRef })
  private boardItems!: QueryList<ElementRef<HTMLElement>>;
  private resizeObserver?: ResizeObserver;
  private layoutFrame: number | null = null;

  private readonly GAP = 22;
  private readonly COMPLETED_PREVIEW_LIMIT = 2;

  constructor() {
    addIcons({search,close,personCircle,checkmark,logOut,pencil,trash,reorderThree,add,layersOutline,returnDownBack,checkmarkCircle,chevronDown,chevronForward});
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

      if (session) {
        await this.localRepository.initializeForUser(session.user.id);
        const localBoard = this.localRepository.getStoredBoardForUser(session.user.id);
        this.repository = this.supabaseRepository;
        await this.repository.initializeForUser(session.user.id, localBoard);
      } else {
        this.repository = this.localRepository;
        await this.repository.initializeForUser(null);
      }

      this.restoreTheme(session?.user.id ?? null);
      this.subscription = this.repository.watchBoard().subscribe((board) => this.board = board);
    } catch (error) {
      console.error('No se pudo cargar el tablero sincronizado', error);
      this.boardError = 'No se pudo cargar el tablero desde la nube. Comprueba la conexión y la configuración de Supabase.';
    } finally {
      this.loadingBoard = false;
    }
  }

  toggleAccountMenu(): void {
    this.accountMenuOpen = !this.accountMenuOpen;
  }

  selectTheme(theme: typeof this.themes[number]): void {
    this.activeTheme = theme;
    this.applyTheme(theme);
    const userId = this.auth.session?.user.id ?? 'local';
    localStorage.setItem(`checklist-trello-theme-v1:${userId}`, theme.id);
    this.accountMenuOpen = false;
  }

  async logout(): Promise<void> {
    this.accountMenuOpen = false;
    await this.auth.signOut();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  @HostListener('document:keydown.escape')
  closeAccountMenuOnEscape(): void {
    this.accountMenuOpen = false;
    this.cancelDeleteList();
  }

  private restoreTheme(userId: string | null): void {
    const key = `checklist-trello-theme-v1:${userId ?? 'local'}`;
    const savedThemeId = localStorage.getItem(key);
    const savedTheme = this.themes.find((theme) => theme.id === savedThemeId);
    if (savedTheme) {
      this.activeTheme = savedTheme;
      this.applyTheme(savedTheme);
    }
  }

  private applyTheme(theme: typeof this.themes[number]): void {
    this.boardBackground = theme.background;
    this.toolbarBackground = theme.toolbar;
    this.themeAccent = theme.accent;
    this.themeFab = theme.fab;
    this.themeFabHover = theme.accent;
  }

  ngAfterViewInit(): void {
    this.boardItems.changes.subscribe(() => this.scheduleMasonryLayout());
    this.resizeObserver = new ResizeObserver(() => this.scheduleMasonryLayout());
    const board = document.querySelector('.board');
    if (board) this.resizeObserver.observe(board);
    this.scheduleMasonryLayout();
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
      this.placeNewListAtStart = true;
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
    let lists = [...this.board.lists].sort((a, b) => a.position - b.position);
    if (this.searching && this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      lists = lists.filter((l) => l.title.toLowerCase().includes(q));
    }
    return lists;
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

  async deleteList(listId: string): Promise<void> {
    this.board.lists = this.board.lists.filter((list) => list.id !== listId);
    this.collapsed.delete(listId);
    this.expandedCompleted.delete(listId);
    this.reorderLists();
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
    await this.deleteList(list.id);
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
    this.newListTitle = '';
    this.addingList = false;
    await this.persist();
  }

  cancelAddList(): void {
    this.addingList = false;
    this.newListTitle = '';
  }

  startListDrag(listId: string, event: DragEvent): void {
    this.draggedListId = listId;
    event.dataTransfer?.setData('text/plain', `list:${listId}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  dragOverList(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  async dropList(targetListId: string, event: DragEvent): Promise<void> {
    event.preventDefault();
    if (!this.draggedListId || this.draggedListId === targetListId) return;
    const ordered = this.visibleLists;
    const from = ordered.findIndex((list) => list.id === this.draggedListId);
    const to = ordered.findIndex((list) => list.id === targetListId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    ordered.forEach((list, index) => list.position = index);
    this.board.lists = ordered;
    this.draggedListId = null;
    await this.persist();
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

  clearDragState(): void {
    this.draggedListId = null;
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
    const board = document.querySelector<HTMLElement>('.board');
    const items = this.boardItems?.toArray().map((item) => item.nativeElement) ?? [];
    if (!board || items.length === 0) return;

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
      await this.repository.saveBoard(this.board);
      this.scheduleMasonryLayout();
    } catch (error) {
      console.error('No se pudo guardar el tablero sincronizado', error);
      this.saveError = 'No se pudieron guardar los cambios en la nube. Revisa tu conexión e inténtalo de nuevo.';
    } finally {
      this.busy = false;
    }
  }
}