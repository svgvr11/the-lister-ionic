import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, QueryList, ViewChildren, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonContent, IonHeader, IonIcon, IonInput, IonTitle, IonToolbar
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  add, checkmark, chevronDown, chevronForward, close,
  trash, personCircle, layersOutline, search, pencil
} from 'ionicons/icons';
import { Subscription } from 'rxjs';
import { ChecklistBoard, ChecklistList, ChecklistTask } from '../../models/board.models';
import { LocalBoardRepository } from '../../core/services/local-board.repository';

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
  private readonly repository = inject(LocalBoardRepository);
  private subscription?: Subscription;

  board!: ChecklistBoard;
  expanded = new Set<string>();
  collapsed = new Set<string>();
  addingTaskFor: string | null = null;
  addingList = false;
  newListTitle = '';
  newTaskText = '';
  busy = false;

  searching = false;
  searchQuery = '';

  editingTitle = false;
  titleDraft = '';

  private draggedListId: string | null = null;
  private draggedTask: { listId: string; taskId: string } | null = null;

  @ViewChildren('boardItem', { read: ElementRef })
  private boardItems!: QueryList<ElementRef<HTMLElement>>;
  private resizeObserver?: ResizeObserver;
  private layoutFrame: number | null = null;

  private readonly ITEM_WIDTH = 307;
  private readonly GAP = 13;

  constructor() {
    addIcons({
      add, checkmark, chevronDown, chevronForward, close,
      trash, personCircle, layersOutline, search, pencil
    });
  }

  ngOnInit(): void {
    this.subscription = this.repository.watchBoard().subscribe((board) => this.board = board);
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

  // ✨ Toggle del panel FAB (en lugar de solo abrir)
  toggleAddList(): void {
    this.addingList = !this.addingList;
    if (this.addingList) {
      this.newListTitle = '';
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

  visibleCompletedTasks(list: ChecklistList): ChecklistTask[] {
    const completed = this.completedTasks(list);
    return this.expanded.has(list.id) ? completed : completed.slice(0, 3);
  }

  hiddenCompletedCount(list: ChecklistList): number {
    return Math.max(0, this.completedTasks(list).length - this.visibleCompletedTasks(list).length);
  }

  isCollapsed(listId: string): boolean {
    return this.collapsed.has(listId);
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  async addTask(list: ChecklistList): Promise<void> {
    const text = this.newTaskText.trim();
    if (!text) return;
    const maxPosition = list.tasks.reduce((max, task) => Math.max(max, task.position), -1);
    list.tasks.push({
      id: crypto.randomUUID(), listId: list.id, text, completed: false,
      position: maxPosition + 1, createdAt: new Date().toISOString()
    });
    this.newTaskText = '';
    this.addingTaskFor = null;
    await this.persist();
  }

  startAddingTask(listId: string): void {
    this.addingTaskFor = listId;
    this.newTaskText = '';
  }

  cancelAddingTask(): void {
    this.addingTaskFor = null;
    this.newTaskText = '';
  }

  async toggleTask(list: ChecklistList, task: ChecklistTask): Promise<void> {
    task.completed = !task.completed;
    this.reorderTasks(list);
    if (!task.completed) this.expanded.delete(list.id);
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
    this.expanded.delete(listId);
    this.reorderLists();
    await this.persist();
  }

  toggleCollapsed(listId: string): void {
    if (this.collapsed.has(listId)) this.collapsed.delete(listId);
    else this.collapsed.add(listId);
    this.scheduleMasonryLayout();
  }

  showMore(list: ChecklistList): void {
    this.expanded.add(list.id);
    this.scheduleMasonryLayout();
  }

  async addList(): Promise<void> {
    const title = this.newListTitle.trim();
    if (!title || this.board.lists.length >= 50) return;
    const position = this.board.lists.reduce((max, list) => Math.max(max, list.position), -1) + 1;
    this.board.lists.push({
      id: crypto.randomUUID(), boardId: this.board.id, title, position,
      createdAt: new Date().toISOString(), tasks: []
    });
    this.newListTitle = '';
    this.addingList = false; // ✨ Cerrar el panel al crear
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
    const sourceIndex = sourceList.tasks.findIndex((task) => task.id === this.draggedTask?.taskId);
    if (sourceIndex < 0) return;
    const [moved] = sourceList.tasks.splice(sourceIndex, 1);
    const targetIndex = targetList.tasks.findIndex((task) => task.id === targetTaskId);
    targetList.tasks.splice(Math.max(0, targetIndex), 0, moved);
    this.reorderTasks(sourceList);
    this.reorderTasks(targetList);
    this.draggedTask = null;
    await this.persist();
  }

  async dropTaskInList(targetList: ChecklistList, event: DragEvent): Promise<void> {
    event.preventDefault();
    if (!this.draggedTask) return;
    const sourceList = this.board.lists.find((list) => list.id === this.draggedTask?.listId);
    if (!sourceList) return;
    const sourceIndex = sourceList.tasks.findIndex((task) => task.id === this.draggedTask?.taskId);
    if (sourceIndex < 0) return;
    const [moved] = sourceList.tasks.splice(sourceIndex, 1);
    targetList.tasks.push(moved);
    this.reorderTasks(sourceList);
    this.reorderTasks(targetList);
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

    const itemWidth = this.ITEM_WIDTH;
    const columns = Math.max(1, Math.floor((board.clientWidth + this.GAP) / (itemWidth + this.GAP)));
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
      const x = column * (itemWidth + this.GAP);
      const y = heights[column];
      item.style.left = `${x}px`;
      item.style.top = `${y}px`;
      heights[column] = y + item.offsetHeight + this.GAP;
    });

    board.style.height = `${Math.max(...heights, 0)}px`;
  }

  private reorderLists(): void {
    this.visibleLists.forEach((list, index) => list.position = index);
  }

  private reorderTasks(list: ChecklistList): void {
    const pending = list.tasks.filter((task) => !task.completed).sort((a, b) => a.position - b.position);
    const completed = list.tasks.filter((task) => task.completed).sort((a, b) => a.position - b.position);
    [...pending, ...completed].forEach((task, index) => task.position = index);
  }

  private async persist(): Promise<void> {
    this.busy = true;
    try {
      await this.repository.saveBoard(this.board);
      this.scheduleMasonryLayout();
    } finally {
      this.busy = false;
    }
  }
}