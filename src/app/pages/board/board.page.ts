import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, DoCheck, ElementRef, HostBinding, HostListener, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonContent, IonHeader, IonIcon, IonInput, IonRefresher, IonRefresherContent,
  IonRippleEffect, IonTitle, IonToolbar
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  add, archiveOutline, checkmark, chevronDown, chevronForward, close, logOut,
  megaphoneOutline, trash, trashBinOutline, personCircle, personRemoveOutline, layersOutline, search, pencil,
  checkmarkCircle, returnDownBack, reorderThree, reorderTwo, schoolOutline
} from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragEnd,
  CdkDragHandle,
  CdkDragMove,
  CdkDragPlaceholder,
  CdkDragPreview,
  CdkDragRelease,
  CdkDragStart,
  CdkDropList
} from '@angular/cdk/drag-drop';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { ChecklistBoard, ChecklistList, ChecklistTask } from '../../models/board.model';
import { AppFooterComponent } from '../../shared/components/app-footer/app-footer.component';
import { FeedbackModalComponent } from '../../shared/components/feedback-modal/feedback-modal.component';
import { InlineEditComponent } from '../../shared/components/inline-edit/inline-edit.component';
import { WelcomeModalComponent } from '../../shared/components/welcome-modal/welcome-modal.component';
import { BoardConflict } from '../../services/board.repository';
import { BoardMergeConflictError } from '../../core/board/board-merge/board-merge';
import { BoardTheme, BOARD_THEMES, migrateLegacyTheme, storeTheme } from '../../core/board/board-themes/board-themes';
import { pickOnAccent, onAccentToken } from '../../core/ui/edit-contrast/edit-contrast';
import { APP_VERSION_LABEL } from '../../core/app-version';
import { FEEDBACK_FAB_ENABLED } from '../../core/feedback/feedback-core/feedback-core';
import { isListComplete, MAX_BOARD_LISTS, purgeExpiredArchivedLists, purgeExpiredLists } from '../../core/list/list-retention/list-retention';
import { MAX_LIST_TITLE_LENGTH, normalizeListTitle } from '../../core/platform/limits/limits';
import { ARCHIVE_RETENTION_DAYS } from '../../core/list/archive/archive';
import { TRASH_RETENTION_DAYS } from '../../core/list/trash/trash';
import { MasonryController, MASONRY_GAP } from '../../core/ui/masonry-layout/masonry-layout';
import { AuthService } from '../../services/auth.service';
import { DELETE_CONFIRM_TEXT, isDeleteConfirmText } from '../../core/auth/delete-account/delete-account';
import { BoardSessionService } from '../../services/board-session.service';
import { FeedbackService } from '../../services/feedback.service';
import { SessionGuardService } from '../../services/session-guard.service';
import { OverlayStackService, type RegisteredOverlay } from '../../services/overlay-stack.service';
import { OwnBoardSnapshots } from '../../core/board/board-sync/board-sync';
import {
  listDragKeyOffset,
  listMoveAnnouncement,
  listMoveBlockedAnnouncement,
  readListDragPayload,
  setListDragPayload
} from '../../core/board/board-list-drag/board-list-drag';
import {
  CARD_CLICK_SUPPRESS_MS,
  CDK_DRAG_SAFETY_TIMEOUT_MS,
  CDK_DRAG_START_DELAY_MS,
  LIST_REORDER_ENGINE,
  TOUCH_REORDER_ACTIVATION,
  autoScrollStepFor,
  canSortBeforePinned,
  cdkScrollNotice,
  planCdkReorder,
  resolveReorderEngine,
  shouldOpenCardFocus
} from '../../core/board/cdk-reorder/cdk-reorder';
import { resolveBoardFlowMode } from '../../core/ui/masonry-layout/masonry-layout';
import {
  boardsEqual,
  decideIncomingBoard,
  decidePendingAfterSave,
  decidePendingBeforeSave,
  pideDobleConfirmacion,
  tableroRemotoParaResolver,
  type EstadoTrasGuardar
} from '../../core/board/board-conflict-rules/board-conflict-rules';
import {
  addListToBoard,
  completedTaskCount,
  editListTitle,
  isAtListLimit,
  isPinned,
  listLimitLabel,
  listProgress,
  listProgressPercent,
  moveListBefore,
  moveListByOffset,
  moveListToArchive,
  moveListToTrash,
  orderedLists,
  pinList,
  reorderLists,
  syncPinnedList,
  taskCounterLabel
} from '../../core/board/board-list-rules/board-list-rules';
import {
  COMPLETED_PREVIEW_LIMIT,
  addTaskToList,
  completedTasks,
  deleteTask,
  dropTask,
  dropTaskInList,
  editTaskText,
  getHighlightedSegments,
  hiddenCompletedCount,
  pendingTasks,
  reorderTasks,
  setTaskPositions,
  shouldShowCompletedToggle,
  toggleTask,
  visibleCompletedTasks
} from '../../core/board/board-task-rules/board-task-rules';
import { focusListRemovalMessage, type FocusListRemovalCause } from '../../core/ui/focus-notice/focus-notice';
import { BoardViewMode, readStoredBoardView, storeBoardView } from '../../core/board/board-view/board-view';
import {
  isMacOsBrowser,
  markWelcomeSeen,
  readWelcomeSeen,
  shouldShowWelcome,
  welcomeVariant,
  type WelcomeVariant
} from '../../core/ui/welcome-tour/welcome-tour';
import { describeDeviceTimeZone, formatLastUpdated, resolveListUpdatedAt, splitLastUpdated } from '../../core/list/list-updated-at/list-updated-at';

/** Tiempo que el tooltip de zona horaria se queda en pantalla cuando se abre por toque. */
const TOOLTIP_TACTIL_MS = 4000;

/**
 * Forma mínima de la estrategia de orden de CDK que aquí se usa (ver `notifyCdkScroll`).
 * `updateOnScroll` es privado en CDK y hace falta: es el aviso de que el contenido se ha
 * desplazado, para que la estrategia refresque sus posiciones y vuelva a calcular el
 * destino con el puntero donde está ahora.
 */
interface CdkScrollStrategyShape {
  updateOnScroll(top: number, left: number): void;
}

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [
    CommonModule, FormsModule, IonContent, IonHeader, IonIcon, IonInput, IonRefresher,
    IonRefresherContent, IonRippleEffect, IonTitle, IonToolbar, AppFooterComponent,
    FeedbackModalComponent, InlineEditComponent, WelcomeModalComponent,
    // Reordenamiento táctil de listas: directivas concretas, no el módulo entero, para
    // que el CDK aterrice solo en el chunk del tablero.
    CdkDropList, CdkDrag, CdkDragPreview, CdkDragPlaceholder, CdkDragHandle
  ],
  templateUrl: './board.page.html',
  styleUrls: ['./board.page.scss']
})
export class BoardPage implements OnInit, OnDestroy, AfterViewInit, DoCheck {
  private readonly session = inject(BoardSessionService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly feedback = inject(FeedbackService);
  private readonly sessionGuard = inject(SessionGuardService);
  private readonly overlayStack = inject(OverlayStackService);
  private subscription?: Subscription;
  private lastAppliedBoard: ChecklistBoard | null = null;
  private pendingRemoteBoard: ChecklistBoard | null = null;
  private readonly ownBoardSnapshots = new OwnBoardSnapshots();
  activeConflict: BoardConflict | null = null;
  conflictDialogOpen = false;
  confirmingLocalConflict = false;
  private conflictFromRepository = false;
  private resolvingConflict = false;
  private conflictDialogDeferred = false;

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
  /** Versión de la app, leída del único archivo donde está definida. */
  readonly appVersionLabel = APP_VERSION_LABEL;
  /**
   * El keycap ⌘K y su atajo solo tienen sentido en el navegador de un Mac. En la app nativa
   * (APK) no se registra ningún atajo, y en Windows/Linux tampoco aparece.
   */
  readonly showSearchShortcut = isMacOsBrowser();
  /**
   * El color es de este dispositivo: se lee del almacenamiento local al construir la
   * pantalla, antes del primer pintado, así no sale el color equivocado un instante.
   * Solo local: ninguna otra pestaña, dispositivo ni recarga vuelve a cambiarlo.
   */
  activeTheme: BoardTheme = migrateLegacyTheme(this.auth.session?.user.id ?? null);
  accountMenuOpen = false;
  accountMenuClosing = false;
  isMobilePresentation = false;
  accountMenuMobilePresentation = false;
  newListMobilePresentation = false;
  focusListMobilePresentation = false;
  private accountMenuCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private mobilePresentationQuery: MediaQueryList | null = null;
  private readonly onMobilePresentationChange = (event: MediaQueryListEvent): void => {
    this.isMobilePresentation = event.matches;
    this.scheduleMasonryLayout();
  };
  private newListTitleFocusTimer: ReturnType<typeof setTimeout> | null = null;
  private newListViewportTimer: ReturnType<typeof setTimeout> | null = null;
  private newListViewportResizeHandler: (() => void) | null = null;
  /** Google Play no admite enlaces externos de donación dentro del APK, así que el
   *  botón de Ko-fi solo se renderiza en la web. */
  readonly isNative = Capacitor.isNativePlatform();
  boardViewMode: BoardViewMode = readStoredBoardView(this.isNative);

  setBoardViewMode(mode: BoardViewMode): void {
    if (this.boardViewMode === mode) return;
    // Un arrastre con el dedo a mitad del gesto no puede seguir en la otra vista: se
    // cancela (no reordena) antes de cambiar.
    this.cancelCdkDrag();
    this.boardViewMode = mode;
    storeBoardView(mode, null);
    if (mode === 'cards' && this.isNative) {
      this.clearMasonryStyles();
    } else {
      this.scheduleMasonryLayout();
    }
  }

  private clearMasonryStyles(): void {
    const board = this.boardGridElement;
    if (board) {
      board.style.position = '';
      board.style.height = '';
      board.style.minHeight = '';
    }
    this.boardItems?.forEach((item) => {
      const el = item.nativeElement;
      if (el) {
        el.style.position = '';
        el.style.width = '';
        el.style.left = '';
        el.style.top = '';
      }
    });
  }

  cardTitleTooltip(list: ChecklistList): string {
    const t = list.title;
    return t.length > 90 ? t.slice(0, 87) + '...' : t;
  }

  cardAriaLabel(list: ChecklistList): string {
    const t = this.cardTitleTooltip(list);
    return `${t}, ${this.completedTaskCount(list)} de ${list.tasks.length} tareas completadas`;
  }

  onCardPinClick(list: ChecklistList, event: MouseEvent): void {
    event.stopPropagation();
    void this.pinList(list);
  }

  onCardKeydown(event: KeyboardEvent, list: ChecklistList): void {
    if (this.boardViewMode !== 'cards' || !this.isNative) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.openListFocus(list, event);
    }
  }
  /** El envío de comentarios necesita sesión: sin ella la función responde 401. */
  get feedbackEnabled(): boolean {
    return this.feedback.available;
  }

  private setFocusRemovalCause(list: ChecklistList, cause: FocusListRemovalCause): void {
    if (this.focusListId !== list.id) return;
    this.focusRemovalCause = cause;
    this.focusRemovalListId = list.id;
  }
  readonly donationMessage = '¡Me gusta la app!';
  readonly donationUrl = 'https://ko-fi.com/M4M62R6XT';
  private accountMenuNode: HTMLElement | null = null;
  private accountMenuOpener: HTMLElement | null = null;
  private newListOpener: HTMLElement | null = null;
  private pageActive = false;
  focusListId: string | null = null;
  focusTaskDraft = '';
  focusNotice = '';
  /** Tooltip de la etiqueta «Última actualización» abierto (foco de teclado o toque). */
  focusUpdatedAtTooltipOpen = false;
  private focusUpdatedAtTooltipTimer: ReturnType<typeof setTimeout> | null = null;
  private focusInitialTitleFocusPending = false;
  private focusOpener: HTMLElement | null = null;
  private focusRemovalCause: FocusListRemovalCause | null = null;
  private focusRemovalListId: string | null = null;
  private focusNoticeTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Zona horaria del dispositivo. Se lee del dispositivo al abrir el modal de enfoque: en
   * producción NUNCA se fija una zona (las fijas son solo para los tests).
   */
  private dispositivoZonaHoraria = Intl.DateTimeFormat().resolvedOptions().timeZone;

  get listProgress(): string {
    return listProgress(this.board);
  }

  get isAtListLimit(): boolean {
    return isAtListLimit(this.board);
  }

  /** Límite de listas del tablero, leído de la constante compartida. */
  readonly maxBoardLists = MAX_BOARD_LISTS;

  /** Texto del botón de añadir lista: avisa cuando el tablero ya está lleno. */
  get listLimitLabel(): string {
    return listLimitLabel(this.board);
  }

  @HostBinding('style.--board-bg') boardBackground = this.activeTheme.background;
  @HostBinding('style.--topbar-bg') toolbarBackground = this.activeTheme.toolbar;
  @HostBinding('style.--accent') themeAccent = this.activeTheme.accent;
  @HostBinding('style.--on-accent') themeOnAccent = onAccentToken(pickOnAccent(this.activeTheme.accent));
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

  /** Límite de caracteres para títulos de lista, expuesto al template. */
  readonly maxListTitleLength = MAX_LIST_TITLE_LENGTH;

  /** Contador de caracteres para el título de la lista nueva. */
  newListTitleCount = 0;

  /** Contador de caracteres para el título del tablero en edición. */
  titleDraftCount = 0;

  /** Contador de caracteres para el input de edición de lista. */
  listTitleEditCount = 0;

  editingTaskId: string | null = null;
  taskTextDraft = '';
  /** Lista a la que se le va a abrir el diálogo: se archiva si está completa, si no, al basurero. */
  listToRemove: ChecklistList | null = null;
  /** Se enciende mientras el diálogo de archivar ejecuta una de sus acciones: deja los tres
   *  botones deshabilitados para que un doble clic no dispare dos acciones sobre la misma
   *  lista. El diálogo del basurero no lo usa y sigue con su comportamiento de siempre. */
  removeDialogBusy = false;
  /** Botón del tablero que abrió el diálogo de archivar, para devolverle el foco al cerrar. */
  private removeDialogOpener: HTMLElement | null = null;

  private draggedTask: { listId: string; taskId: string } | null = null;

  /** Lista que se está arrastrando con el handle de su cabecera (null si no hay ninguna). */
  private draggedListId: string | null = null;
  /** Tarjeta sobre la que caería la lista arrastrada: pinta el indicador de destino. */
  listDropTargetId: string | null = null;
  /** Último mensaje anunciado en la región `aria-live` (movimientos con el teclado). */
  listAnnouncement = '';
  /** Escuchas de documento del arrastre de listas: solo existen con una lista en vuelo. */
  private readonly onListDragOverDocument = (event: DragEvent): void => this.onListDragOver(event);
  private readonly onListDropDocument = (event: DragEvent): void => void this.onListDrop(event);

  // ── Reordenamiento de listas con CDK (vista Tarjetas y vista de lista) ────────
  //
  // Motor propio y separado del de escritorio (HTML5): nunca coexisten en el mismo
  // elemento. La lógica de decisión vive en `cdk-reorder.ts` (probada sin DOM); aquí
  // solo se traduce lo que publica CDK a la única regla de negocio, `moveListBefore`.

  /** Retardo de pulsación larga: hasta que no pasa, el deslizamiento sigue scrolleando. */
  readonly cdkDragStartDelay = CDK_DRAG_START_DELAY_MS;
  /** Activación por pulsación larga; el respaldo documentado es el asa visible. */
  readonly cdkTouchActivation = TOUCH_REORDER_ACTIVATION;
  /** Red de seguridad: si un arrastre se quedara colgado, este plazo lo limpia. */
  readonly cdkDragSafetyTimeout = CDK_DRAG_SAFETY_TIMEOUT_MS;

  /** ¿Se está dibujando la vista Tarjetas? Solo existe en la app nativa. */
  get cardsViewActive(): boolean {
    return this.boardViewMode === 'cards' && this.isNative;
  }

  /**
   * ¿Se puede reordenar con el dedo en este momento? Hace falta todo a la vez: vista
   * Tarjetas en la app nativa, sin búsqueda abierta (la vista está filtrada) y un
   * dispositivo para el que `resolveReorderEngine` elige CDK (táctil o ventana de 700px
   * o menos). El interruptor `LIST_REORDER_ENGINE` es la salida de emergencia.
   *
   * OJO: la vista Tarjetas solo existe en nativo, así que una ventana estrecha en web
   * móvil sigue sin tener dónde reordenar con el dedo. Eso queda para la Tarea 2.
   */
  get cardsReorderEnabled(): boolean {
    if (LIST_REORDER_ENGINE !== 'cdk') return false;
    if (!this.cardsViewActive) return false;
    if (this.searching) return false;
    return (
      resolveReorderEngine({ touch: this.deviceHasTouch(), width: window.innerWidth }) === 'cdk'
    );
  }

  /**
   * Lo mismo para la vista de LISTA: aquí sí cuenta el tamaño de ventana, porque la vista
   * de lista se ve tanto en la app nativa como en web móvil.
   */
  get listCdkReorderEnabled(): boolean {
    if (LIST_REORDER_ENGINE !== 'cdk') return false;
    if (this.cardsViewActive) return false;
    if (this.searching) return false;
    return (
      resolveReorderEngine({ touch: this.deviceHasTouch(), width: window.innerWidth }) === 'cdk'
    );
  }

  /** Un único interruptor para la rejilla: la vista que se está dibujando decide. */
  get reorderEnabled(): boolean {
    return this.cardsViewActive ? this.cardsReorderEnabled : this.listCdkReorderEnabled;
  }

  /**
   * ¿Hay un arrastre táctil en curso? La plantilla lo usa para bloquear el paneo mientras
   * dura el gesto (`.board.reordering`); en cuanto se suelta o se cancela, el scroll vuelve
   * a su comportamiento normal.
   */
  get cdkReordering(): boolean {
    return this.cdkDragActive;
  }

  /**
   * Orientación del `cdkDropList` en la vista de lista.
   *
   * MEDIDO EN EL SPIKE de la Tarea 2 y CORREGIDO tras la prueba de dedo: empezó en
   * `'vertical'`, pero al arrastrar hacia abajo con auto-scroll el hueco se quedaba
   * arriba. La deriva, medida sobre el tablero real como (posición del hueco) −
   * (posición del dedo), pasó de +365 px a −814 px mientras el contenido se desplazaba:
   * el destino coincidía al soltar, pero la referencia visual que sigue el usuario no.
   *
   * La causa es de `SingleAxisSortStrategy` (la estrategia de `'vertical'`): compara el
   * puntero con client rects congelados al empezar el gesto y solo se refrescan con el
   * scroll que CDK ve; el scroller de `ion-content` vive en su shadow DOM y su scroll no
   * cruza la frontera, así que nuestro auto-scroll le resulta invisible.
   *
   * `'mixed'` (`MixedSortStrategy`) resuelve el destino con `elementFromPoint` en vivo:
   * el hueco se mueve con el dedo en cada fotograma, auto-scroll incluido, que es lo que
   * hace que la vista Tarjetas funcione bien desde la Tarea 1. Medido con la misma traza:
   * deriva ≈ 0 durante todo el arrastre.
   */
  get listOrientation(): 'vertical' | 'mixed' {
    return 'mixed';
  }

  /**
   * Forma mínima de la estrategia de orden de CDK que aquí se usa. `updateOnScroll` es
   * privado en CDK y hace falta: es el aviso de que el contenido se ha desplazado, para
   * que la estrategia refresque sus posiciones y vuelva a calcular el destino con el
   * puntero donde está ahora.
   */
  readonly cdkStrategyShape: CdkScrollStrategyShape = { updateOnScroll: () => undefined };

  private deviceHasTouch(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }
  /**
   * Predicado de orden de CDK: la fijada ocupa el índice 0 y nada se coloca delante de
   * ella. Refuerza visualmente lo que ya garantiza `moveListBefore`.
   */
  readonly cdkSortPredicate = (index: number): boolean =>
    canSortBeforePinned(index, this.board.pinnedListId ?? null);

  /** Arrastre CDK en curso: bloquea el remoto pendiente y Atrás/Escape lo cancelan. */
  private cdkDragActive = false;
  /** Referencia al `CdkDrag` en curso, para poder reiniciarlo al cancelar. */
  private activeCdkDrag: CdkDrag<ChecklistList> | null = null;
  /**
   * Lista que se está arrastrando con el dedo. Hace falta guardarla: si una actualización
   * remota la elimina a mitad del gesto, CDK NO emite `cdkDragEnded` (lo comprobó el spike
   * de la Tarea 2), así que el estado de arrastre se limpia al cambiar el tablero.
   */
  private cdkDraggedListId: string | null = null;
  /** Cancelación pedida: el soltable resultante no debe reordenar. */
  private cdkSuppressDrop = false;
  /** Posición vertical del puntero durante el arrastre, para el auto-scroll. */
  private cdkPointerY = 0;
  /** Elemento scroller del `IonContent`, medido al empezar el arrastre. */
  private cdkScrollElement: HTMLElement | null = null;
  /** Fotograma en curso del auto-scroll propio (0 = parado). */
  private cdkAutoScrollFrame = 0;
  /** Hasta cuándo se come el clic posterior al arrastre (marca de tiempo). */
  private cdkSuppressClickUntil = 0;
  /** Temporizador que fuerza la limpieza de un arrastre atascado. */
  private cdkSafetyTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * ¿La rejilla va en flujo normal? `true` en una columna (móvil), donde el masonry no
   * hace falta y estorba al reordenamiento táctil. Se recalcula en `scheduleMasonryLayout`
   * con la histéresis de `resolveBoardFlowMode`.
   */
  private flowMode = false;

  /** Modal de comentarios abierto. Ambos puntos de entrada (FAB y menú de perfil) lo abren. */
  feedbackOpen = false;
  /** Botón que abrió el modal, para devolverle el foco al cerrar. */
  private feedbackOpener: HTMLElement | null = null;
  /** Recorrido de bienvenida abierto (modal de 4 páginas en escritorio, 3 en móvil). */
  welcomeTourOpen = false;
  /**
   * Variante con la que se abrió el recorrido: se decide al abrir (app nativa o pantalla
   * de 700px o menos → móvil) y no se recalcula mientras el modal está abierto.
   */
  welcomeTourVariant: WelcomeVariant = 'desktop';
  /** Pendiente de abrirse: al cargar el tablero había otro overlay abierto y hay que esperar. */
  private welcomeTourDeferred = false;
  /** Elemento que tenía el foco al abrirse el recorrido, para devolvérselo al cerrar. */
  private welcomeTourOpener: HTMLElement | null = null;
  private deleteDialogOpener: HTMLElement | null = null;
  private conflictDialogOpener: HTMLElement | null = null;

  /** Interruptor global de la función; el estado visual de la página no oculta el botón. */
  readonly feedbackFabEnabled = FEEDBACK_FAB_ENABLED;

  /**
   * Un modal bloquea la interacción con el botón, pero no su renderizado. El menú de perfil
   * no es modal: el botón queda sobre su scrim para poder abrir feedback desde allí.
   */
  get feedbackFabBlocked(): boolean {
    return this.addingList
      || (this.accountMenuOpen && this.accountMenuMobilePresentation)
      || this.focusListId !== null
      || this.listToRemove !== null
      || this.conflictDialogOpen
      || this.deleteDialogOpen
      || this.feedbackOpen
      || this.welcomeTourOpen
      || this.sessionGuard.blocked() !== null;
  }

  get accountMenuPopupType(): 'dialog' | 'menu' {
    return this.accountMenuOpen
      ? (this.accountMenuMobilePresentation ? 'dialog' : 'menu')
      : (this.isMobilePresentation ? 'dialog' : 'menu');
  }

  get boardModalOpen(): boolean {
    return this.addingList
      || (this.accountMenuOpen && this.accountMenuMobilePresentation)
      || this.focusListId !== null
      || this.listToRemove !== null
      || this.conflictDialogOpen
      || this.deleteDialogOpen
      || this.feedbackOpen
      || this.welcomeTourOpen
      || this.sessionGuard.blocked() !== null;
  }

  /** Resuelve siempre la lista viva por id: applyBoard puede reemplazar el tablero. */
  get focusList(): ChecklistList | null {
    return this.focusListId
      ? this.board.lists.find((list) => list.id === this.focusListId) ?? null
      : null;
  }

  @ViewChildren('boardItem', { read: ElementRef })
  private boardItems!: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('boardContent', { read: IonContent })
  private boardContent?: IonContent;
  @ViewChild('searchInput', { read: IonInput })
  private searchInput?: IonInput;
  @ViewChild('accountButton', { read: ElementRef })
  private accountButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('accountMenu', { read: ElementRef })
  private set accountMenu(ref: ElementRef<HTMLElement> | undefined) {
    this.accountMenuNode = ref?.nativeElement ?? null;
    if (!ref) return;
    requestAnimationFrame(() => {
      this.positionAccountMenu();
      this.accountMenuNode?.querySelector<HTMLElement>('.theme-option')?.focus();
    });
  }
  @ViewChild('newListFab', { read: ElementRef })
  private newListFab?: ElementRef<HTMLButtonElement>;
  @ViewChild('newListTitleInput', { read: IonInput })
  private newListTitleInput?: IonInput;
  @ViewChild('focusTitleButton', { read: ElementRef })
  private set focusTitleButton(button: ElementRef<HTMLButtonElement> | undefined) {
    if (!button || !this.focusInitialTitleFocusPending) return;
    requestAnimationFrame(() => {
      if (!this.focusInitialTitleFocusPending) return;
      this.focusInitialTitleFocusPending = false;
      if (button.nativeElement.isConnected) button.nativeElement.focus();
    });
  }
  @ViewChild('focusListTasks', { read: ElementRef })
  private focusListTasks?: ElementRef<HTMLElement>;
  @ViewChild('focusDialog', { read: ElementRef })
  private focusDialog?: ElementRef<HTMLElement>;
  /** Etiqueta «Última actualización» del pie del modal. Solo existe con el modal abierto. */
  @ViewChild('updatedAtLabel', { read: ElementRef })
  private updatedAtLabel?: ElementRef<HTMLElement>;
  @ViewChild('deleteAccountInput', { read: ElementRef })
  private set deleteAccountInput(input: ElementRef<HTMLInputElement> | undefined) {
    if (input) requestAnimationFrame(() => input.nativeElement.focus());
  }
  @ViewChild('syncConflictFocus', { read: ElementRef })
  private set syncConflictFocus(button: ElementRef<HTMLButtonElement> | undefined) {
    if (button) requestAnimationFrame(() => button.nativeElement.focus());
  }
  @ViewChild(FeedbackModalComponent)
  private feedbackModal?: FeedbackModalComponent;
  /**
   * Botón principal del diálogo de archivar. Se resuelve como setter porque el diálogo vive
   * dentro de un `*ngIf`: así el foco entra en cuanto el nodo existe, sin `autofocus` (que
   * depende del orden de pintado y no es fiable) ni de temporizadores que puedan quedar vivos.
   */
  @ViewChild('removeDialogPrimary', { read: ElementRef })
  private set removeDialogPrimary(ref: ElementRef<HTMLButtonElement> | undefined) {
    // Al cerrarse el diálogo el setter vuelve a recibir undefined: se suelta la referencia
    // para que ningún clic posterior pueda devolver el foco a un nodo ya desmontado.
    this.removeDialogPrimaryElement = ref?.nativeElement ?? null;
    if (ref) this.focusRemoveDialogPrimary();
  }
  private removeDialogPrimaryElement: HTMLButtonElement | null = null;
  /**
   * Rejilla del tablero. Se declara con setter a propósito: el contenedor vive bajo un
   * `*ngIf` (`visibleLists.length > 0`), así que se crea y se destruye en caliente. El
   * setter es el aviso fiable para atar el observador al nodo vivo (y soltarlo cuando
   * desaparece). Con el `@ViewChild` plano el observador se conectaba antes de que la
   * rejilla existiera y se quedaba atado a un nodo muerto: era la causa de que el
   * masonry no se readaptara al cambiar el ancho de la ventana.
   */
  @ViewChild('boardGrid', { read: ElementRef, static: false })
  private set boardGrid(ref: ElementRef<HTMLElement> | undefined) {
    this.boardGridElement = ref?.nativeElement ?? null;
    if (this.boardGridElement) {
      this.masonry.observe(this.boardGridElement);
      this.scheduleMasonryLayout();
    } else {
      this.masonry.release();
    }
  }
  private boardGridElement: HTMLElement | null = null;
  /**
   * La lista de CDK que envuelve la rejilla. Hace falta referencia para poder avisarle de
   * nuestro auto-scroll (ver `notifyCdkScroll`): su scroller es el de `ion-content`, que
   * vive en shadow DOM, y sin el aviso el hueco se queda atrás durante el arrastre.
   */
  @ViewChild(CdkDropList, { static: false })
  private boardDropList?: CdkDropList<ChecklistList[]>;
  /**
   * Ciclo de vida del masonry: observa la rejilla y recalcula en vivo cuando cambia el
   * ancho del contenedor (ventana, zoom, rotación o barra de scroll).
   */
  private readonly masonry = new MasonryController({
    gap: MASONRY_GAP,
    getContainer: () => this.boardGridElement,
    getItems: () => this.boardItems?.toArray().map((item) => item.nativeElement) ?? [],
    // En flujo normal (una columna) el masonry no maqueta NADA: ni desde el observador de
    // tamaño ni desde las pasadas programadas. Sin esta comprobación, el `ResizeObserver`
    // volvía a dejar `position:absolute` y altura fija sobre la rejilla en flujo después de
    // limpiarla, y con eso el arrastre táctil dejaba el hueco de la tarjeta movida.
    canLayout: () => {
      this.refreshFlowMode();
      return !this.flowMode;
    },
    onSkipLayout: () => this.clearMasonryStyles()
  });
  private readonly COMPLETED_PREVIEW_LIMIT = COMPLETED_PREVIEW_LIMIT;

  constructor() {
    addIcons({search,close,personCircle,personRemoveOutline,checkmark,logOut,pencil,trash,trashBinOutline,reorderThree,reorderTwo,add,layersOutline,returnDownBack,checkmarkCircle,chevronDown,chevronForward,archiveOutline,megaphoneOutline,schoolOutline});
  }

  ngOnInit(): void {
    this.initializeMobilePresentation();
    void this.initializeBoard();
  }

  ionViewDidEnter(): void {
    this.pageActive = true;
    if (this.activeConflict) this.conflictDialogDeferred = true;
    this.presentDeferredConflict();
    // Al entrar, el contenedor puede haberse recreado o venir con ancho 0 (se vuelve de
    // otra página). Se reconcilia el observador con el nodo vivo y se recalcula.
    this.masonry.observe();
    this.scheduleMasonryLayout();
    this.syncOverlayStack();
  }

  ionViewWillLeave(): void {
    this.pageActive = false;
    this.closePageOverlays();
    this.overlayStack.unregisterOwner('board');
  }

  ngDoCheck(): void {
    if (this.focusListId && !this.focusList) {
      const cause = this.focusRemovalListId === this.focusListId
        ? this.focusRemovalCause ?? 'remote'
        : 'remote';
      this.closeFocusModal(false);
      this.focusRemovalCause = null;
      this.focusRemovalListId = null;
      this.showFocusNotice(focusListRemovalMessage(cause));
    }
    this.presentDeferredConflict();
    // El recorrido de bienvenida espera a que no quede ningún overlay abierto.
    if (this.welcomeTourDeferred && this.canOpenWelcomeTour()) this.openWelcomeTour();
    if (this.pageActive) this.syncOverlayStack();
  }

  private canShowConflictDialog(): boolean {
    return !this.accountMenuOpen
      && !this.addingList
      && !this.focusListId
      && !this.listToRemove
      && !this.deleteDialogOpen
      && !this.feedbackOpen
      && !this.welcomeTourOpen
      && !this.sessionGuard.blocked();
  }

  private presentDeferredConflict(): void {
    if (!this.pageActive || !this.activeConflict || !this.conflictDialogDeferred
      || !this.canShowConflictDialog()) return;
    this.conflictDialogOpen = true;
    this.conflictDialogDeferred = false;
  }

  private syncOverlayStack(): void {
    const overlays: RegisteredOverlay[] = [];
    if (this.accountMenuOpen && !this.accountMenuClosing) {
      overlays.push({ id: 'board:profile-menu', close: () => this.closeAccountMenu(true) });
    }
    if (this.addingList) {
      overlays.push({ id: 'board:new-list', close: () => this.cancelAddList() });
    }
    if (this.focusListId) {
      overlays.push({ id: 'board:focus-list', close: () => this.closeFocusModal() });
    }
    if (this.listToRemove) {
      overlays.push({ id: 'board:remove-list', close: () => this.cancelDeleteList() });
    }
    if (this.deleteDialogOpen) {
      overlays.push({
        id: 'board:delete-account',
        close: () => this.cancelDeleteDialog(),
        dismissible: !this.deleteBusy
      });
    }
    if (this.conflictDialogOpen) {
      overlays.push({ id: 'board:sync-conflict', close: () => this.closeConflictDialog() });
    }
    if (this.feedbackOpen) {
      overlays.push({ id: 'board:feedback', close: () => this.requestFeedbackCloseFromBack() });
    }
    if (this.welcomeTourOpen) {
      overlays.push({ id: 'board:welcome-tour', close: () => this.closeWelcomeTour() });
    }
    // Edición activa: ÚLTIMA para que Escape/Atrás (closeTop) la cancelen
    // primero sin cerrar el foco. NO es modal: sin foco atrapado, sin inert,
    // sin atenuar ni bloquear el feedback (getters la excluyen).
    if (this.editingTaskId || this.editingListId) {
      overlays.push({ id: 'board:inline-edit', close: () => this.cancelActiveEdit() });
    }
    // Arrastre táctil de una lista (vista Tarjetas): Atrás lo cancela en lugar de salir
    // de la app, y el remoto pendiente espera a que se suelte.
    if (this.cdkDragActive) {
      overlays.push({ id: 'board:list-reorder', close: () => this.cancelCdkDrag() });
    }
    this.overlayStack.sync('board', overlays);
  }

  private closePageOverlays(): void {
    this.closeAccountMenu(true, false);
    if (this.addingList) this.cancelAddList(false);
    if (this.focusListId) this.closeFocusModal(false);
    if (this.listToRemove) this.closeRemoveDialog(false);
    if (this.editingTitle) this.cancelEditTitle();
    if (this.editingListId) this.cancelEditList();
    if (this.editingTaskId) this.cancelEditTask();
    for (const listId of Object.keys(this.taskDrafts)) this.taskDrafts[listId] = '';
    this.draggedTask = null;
    this.cancelListDrag();
    // Un arrastre táctil a medio gesto no debe sobrevivir a la salida de la página.
    this.cancelCdkDrag();
    this.closeConflictDialog(false);
    this.conflictDialogDeferred = Boolean(this.activeConflict);
    if (!this.deleteBusy) this.cancelDeleteDialog(false);
    this.feedbackOpen = false;
    this.feedbackOpener = null;
    // Salir de la página con el recorrido abierto también cuenta como «visto».
    if (this.welcomeTourOpen) this.closeWelcomeTour();
    else {
      this.welcomeTourDeferred = false;
      this.welcomeTourOpener = null;
    }
    this.focusNotice = '';
    if (this.focusNoticeTimer !== null) clearTimeout(this.focusNoticeTimer);
    this.focusNoticeTimer = null;
    this.overlayStack.unregisterOwner('board');
  }

  private requestFeedbackCloseFromBack(): void {
    if (this.feedbackModal?.confirmingDiscard) this.feedbackModal.cancelDiscard();
    else this.feedbackModal?.requestClose();
    if (this.feedbackOpen) {
      this.overlayStack.register({
        id: 'board:feedback',
        close: () => this.requestFeedbackCloseFromBack()
      });
    }
  }

  openListFocus(list: ChecklistList, event: Event): void {
    if (this.focusListId || this.editingListId === list.id
      || this.addingList || this.listToRemove || this.deleteDialogOpen
      || this.conflictDialogOpen || this.feedbackOpen || this.activeConflict) return;
    const opener = event.currentTarget;
    this.focusOpener = opener instanceof HTMLElement ? opener : null;

    this.closeAccountMenu(true, false);
    if (this.editingTitle) this.cancelEditTitle();
    if (this.editingListId) this.cancelEditList();
    if (this.editingTaskId) this.cancelEditTask();
    for (const listId of Object.keys(this.taskDrafts)) this.taskDrafts[listId] = '';
    this.draggedTask = null;

    if (!this.board.lists.some((item) => item.id === list.id)) {
      this.focusOpener = null;
      return;
    }
    this.focusTaskDraft = '';
    this.focusListMobilePresentation = this.isMobilePresentation;
    // La zona horaria se lee del dispositivo cada vez que se abre el modal.
    this.dispositivoZonaHoraria = Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.closeFocusUpdatedAtTooltip();
    this.focusInitialTitleFocusPending = true;
    this.focusListId = list.id;
    this.focusRemovalCause = null;
    this.focusRemovalListId = null;
  }

  orderedFocusTasks(list: ChecklistList): ChecklistTask[] {
    return [...list.tasks].sort((left, right) => left.position - right.position);
  }

  async addFocusTask(list: ChecklistList, input?: IonInput): Promise<void> {
    const text = this.focusTaskDraft.trim();
    if (!text) return;
    const existingTaskIds = new Set(list.tasks.map((task) => task.id));
    this.taskDrafts[list.id] = text;
    this.focusTaskDraft = '';
    await this.addTask(list, input);
    const addedTask = list.tasks.find((task) => !existingTaskIds.has(task.id));
    if (!addedTask) return;
    requestAnimationFrame(() => {
      void input?.setFocus();
      this.scrollFocusTaskIntoView(addedTask.id);
    });
  }

  onFocusTaskEnter(event: Event, list: ChecklistList, input?: IonInput): void {
    event.preventDefault();
    void this.addFocusTask(list, input);
  }

  private scrollFocusTaskIntoView(taskId: string): void {
    const container = this.focusListTasks?.nativeElement;
    const task = Array.from(container?.querySelectorAll<HTMLElement>('.focus-task-row') ?? [])
      .find((row) => row.dataset['taskId'] === taskId);
    if (!container || !task) return;

    const containerRect = container.getBoundingClientRect();
    const taskRect = task.getBoundingClientRect();
    let nextScrollTop = container.scrollTop;
    if (taskRect.bottom > containerRect.bottom) {
      nextScrollTop += taskRect.bottom - containerRect.bottom;
    } else if (taskRect.top < containerRect.top) {
      nextScrollTop -= containerRect.top - taskRect.top;
    } else {
      return;
    }
    container.scrollTo({ top: nextScrollTop, behavior: 'smooth' });
  }

  async dropFocusTask(list: ChecklistList, event: DragEvent, taskId?: string): Promise<void> {
    if (this.draggedTask?.listId !== list.id) return;
    if (taskId) await this.dropTask(list, taskId, event);
    else await this.dropTaskInList(list, event);
  }

  onFocusBackdropClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget || this.hasUnsavedFocusText()) return;
    this.closeFocusModal();
  }

  private hasUnsavedFocusText(): boolean {
    const list = this.focusList;
    return Boolean(this.focusTaskDraft.trim())
      || Boolean(list && this.editingListId === list.id
        && normalizeListTitle(this.listTitleDraft) !== list.title);
  }

  async finishFocusModal(): Promise<void> {
    const list = this.focusList;
    if (!list) return;
    if (this.editingListId === list.id) await this.confirmEditList(list);
    this.closeFocusModal();
  }

  closeFocusModal(restoreFocus = true): void {
    if (!this.focusListId) return;
    const listId = this.focusListId;
    if (this.editingListId === listId) this.cancelEditList();
    if (this.editingTaskId) this.cancelEditTask();
    this.closeFocusUpdatedAtTooltip();
    this.focusListId = null;
    this.focusInitialTitleFocusPending = false;
    this.focusTaskDraft = '';
    this.draggedTask = null;
    this.cancelListDrag();
    this.finishClosingFocus();
    if (restoreFocus) {
      const opener = this.focusOpener;
      setTimeout(() => opener?.isConnected && opener.focus(), 0);
    }
    this.focusOpener = null;
  }

  private finishClosingFocus(): void {
    if (this.activeConflict) {
      this.conflictDialogDeferred = true;
      this.presentDeferredConflict();
      return;
    }
    this.releasePendingRemoteBoard();
  }

  // ── «Última actualización» ────────────────────────────────────────────────

  /**
   * Fecha que muestra la etiqueta del pie del modal, o `null` si la lista no tiene ninguna
   * fecha legible (entonces la etiqueta no se pinta).
   */
  get focusListUpdatedAt(): string | null {
    return this.focusList ? resolveListUpdatedAt(this.focusList) : null;
  }

  /** Etiqueta ya formateada, con la zona horaria del dispositivo. */
  focusUpdatedAtLabel(iso: string): string {
    return formatLastUpdated(iso, { locale: 'es-CL', timeZone: this.dispositivoZonaHoraria });
  }

  /**
   * La etiqueta partida en sus dos renglones. En pantallas estrechas se pintan uno sobre otro
   * para que la fecha quepa al lado del botón «Listo», en la misma fila.
   */
  focusUpdatedAtParts(iso: string): { etiqueta: string; fecha: string } {
    return splitLastUpdated(this.focusUpdatedAtLabel(iso));
  }

  /** Texto del tooltip: zona horaria del dispositivo y su desfase en ese instante. */
  focusUpdatedAtTimeZone(iso: string): string {
    return describeDeviceTimeZone(iso, { locale: 'es-CL', timeZone: this.dispositivoZonaHoraria });
  }

  /** Id del tooltip al que apunta el `aria-describedby` de la etiqueta. */
  get focusUpdatedAtTooltipId(): string {
    return this.focusListId ? `focus-list-timezone-${this.focusListId}` : 'focus-list-timezone';
  }

  /** Foco de teclado sobre la etiqueta: muestra el tooltip. */
  onUpdatedAtLabelFocus(): void {
    // Con ratón ya se basta el `:hover`; `matches` no existe en un elemento desmontado.
    if (this.updatedAtLabel?.nativeElement.matches(':focus-visible')) this.openFocusUpdatedAtTooltip();
  }

  /** El foco se va de la etiqueta: el tooltip se va con él. */
  onUpdatedAtLabelBlur(): void {
    this.closeFocusUpdatedAtTooltip();
  }

  /** Toque sobre la etiqueta (pantallas táctiles): abre o cierra el tooltip. */
  onUpdatedAtLabelPointer(event: PointerEvent): void {
    if (event.pointerType !== 'touch') return;
    if (this.focusUpdatedAtTooltipOpen) this.closeFocusUpdatedAtTooltip();
    else this.openFocusUpdatedAtTooltip();
  }

  /**
   * Abre el tooltip y arma el cierre automático: ~4 s en pantalla y cualquier toque fuera de
   * la etiqueta. Con el foco de teclado se cierra solo, al perder el foco o con Escape.
   */
  private openFocusUpdatedAtTooltip(): void {
    this.clearFocusUpdatedAtTooltipTimer();
    this.focusUpdatedAtTooltipOpen = true;
    document.addEventListener('pointerdown', this.onOutsideUpdatedAtPointer);
    this.focusUpdatedAtTooltipTimer = setTimeout(() => {
      this.focusUpdatedAtTooltipTimer = null;
      this.closeFocusUpdatedAtTooltip();
    }, TOOLTIP_TACTIL_MS);
  }

  private closeFocusUpdatedAtTooltip(): void {
    this.clearFocusUpdatedAtTooltipTimer();
    this.focusUpdatedAtTooltipOpen = false;
    document.removeEventListener('pointerdown', this.onOutsideUpdatedAtPointer);
  }

  /**
   * Toque fuera de la etiqueta: cierra el tooltip. El envoltorio corta la propagación de su
   * propio toque, así que aquí solo llegan los de fuera.
   */
  private readonly onOutsideUpdatedAtPointer = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch') return;
    this.closeFocusUpdatedAtTooltip();
  };

  private clearFocusUpdatedAtTooltipTimer(): void {
    if (this.focusUpdatedAtTooltipTimer !== null) {
      clearTimeout(this.focusUpdatedAtTooltipTimer);
      this.focusUpdatedAtTooltipTimer = null;
    }
  }

  /**
   * Escape con el tooltip abierto se lo lleva por delante SIN cerrar el modal. Devuelve si
   * había tooltip que ocultar, para que el Escape no siga su camino.
   */
  private hideUpdatedAtTooltipOnEscape(): boolean {
    if (!this.focusUpdatedAtTooltipOpen) return false;
    this.closeFocusUpdatedAtTooltip();
    return true;
  }

  private showFocusNotice(message: string): void {
    this.focusNotice = message;
    if (this.focusNoticeTimer !== null) clearTimeout(this.focusNoticeTimer);
    this.focusNoticeTimer = setTimeout(() => {
      this.focusNotice = '';
      this.focusNoticeTimer = null;
    }, 3500);
  }

  trapFocusInFocusModal(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const dialog = this.focusDialog?.nativeElement;
    if (!dialog) return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), ion-input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((element) => !element.hasAttribute('inert') && element.offsetParent !== null);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
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

      // El color ya está aplicado desde el primer pintado (tema local del dispositivo).
      // No se vuelve a leer aquí ni en ningún otro flujo: recargar o volver a primer plano
      // dejan el color tal cual.
      const boardStream = await this.session.open();
      this.subscription = new Subscription();
      this.subscription.add(boardStream.subscribe((board) => this.receiveBoard(board)));
      this.subscription.add(this.session.conflict$.subscribe((conflict) => this.receiveConflict(conflict)));
    } catch (error) {
      console.error('No se pudo cargar el tablero sincronizado', error);
      this.boardError = 'No se pudo cargar el tablero desde la nube. Comprueba la conexión y la configuración de Supabase.';
    } finally {
      this.loadingBoard = false;
      // El recorrido de bienvenida se ofrece al entrar con el tablero ya cargado.
      this.scheduleWelcomeTour();
    }
  }

  /**
   * Publica el tablero recibido y descarta lo que ya cumplió su plazo: del basurero a los
   * 7 días y del archivo a los 60.
   */
  private applyBoard(board: ChecklistBoard, persistNormalization = true): void {
    const purged = purgeExpiredLists(board);
    const purgedArchive = purgeExpiredArchivedLists(board);
    this.board = board;
    // Un tablero sin pin (guardado antes de esta función) recibe la primera lista.
    const pinnedChanged = this.syncPinnedList();
    // El orden de dibujo sale de `position` (la fijada primera), así que no hay nada que
    // reconciliar al llegar un tablero nuevo: las listas se pintan según su orden guardado.
    // Los datos suelen llegar después de ngAfterViewInit (carga en la nube), así que se
    // reintenta la conexión al nodo vivo por si la rejilla acaba de aparecer.
    this.masonry.observe();
    this.scheduleMasonryLayout();
    // Si justo se estaba arrastrando una lista con el dedo y esta entrega la borra, hay que
    // limpiar el arrastre: CDK no emite el fin cuando la tarjeta desaparece.
    this.clearCdkDragIfListVanished();
    this.lastAppliedBoard = structuredClone(this.board);
    // Sin este guardado, una lista vencida o el pin inicial volverían a aparecer en el próximo inicio.
    if (persistNormalization && (purged || purgedArchive || pinnedChanged)) void this.persist();
  }

  private receiveBoard(board: ChecklistBoard): void {
    const decision = decideIncomingBoard({
      esEcoPropio: this.ownBoardSnapshots.has(board),
      interaccionActiva: this.hasActiveInteraction(),
      hayConflicto: Boolean(this.activeConflict)
    });
    if (decision === 'ignore') return;
    if (decision === 'defer') {
      // Solo se queda el más reciente: si llegan dos seguidos, el primero se descarta.
      this.pendingRemoteBoard = structuredClone(board);
      return;
    }
    this.applyBoard(structuredClone(board));
  }

  private receiveConflict(conflict: BoardConflict | null): void {
    if (conflict) {
      this.activeConflict = conflict;
      this.pendingRemoteBoard = structuredClone(conflict.remoteBoard);
      this.conflictDialogOpen = false;
      this.conflictDialogDeferred = true;
      this.confirmingLocalConflict = false;
      this.conflictFromRepository = true;
      this.saveError = '';
      this.presentDeferredConflict();
      return;
    }

    if (!this.resolvingConflict && this.conflictFromRepository) {
      this.activeConflict = null;
      this.conflictDialogDeferred = false;
      this.conflictFromRepository = false;
      this.conflictDialogOpen = false;
      this.confirmingLocalConflict = false;
      this.releasePendingRemoteBoard();
    }
  }

  private hasActiveInteraction(): boolean {
    return this.busy
      || this.focusListId !== null
      || this.editingTitle
      || this.editingListId !== null
      || this.editingTaskId !== null
      || this.addingList
      || Object.values(this.taskDrafts).some((draft) => Boolean(draft?.trim()))
      || this.draggedTask !== null
      // Un arrastre de lista en curso también es interacción activa: lo que llegue de otro
      // dispositivo se queda esperando hasta que se suelte, igual que con las tareas.
      || this.draggedListId !== null
      // Lo mismo con el reordenamiento táctil de la vista Tarjetas (CDK).
      || this.cdkDragActive;
  }

  private releasePendingRemoteBoard(saveSucceeded = false): boolean {
    const estado: EstadoTrasGuardar = {
      local: this.board,
      ultimoAplicado: this.lastAppliedBoard,
      pendienteRemoto: this.pendingRemoteBoard,
      guardadoOk: saveSucceeded,
      interaccionActiva: this.hasActiveInteraction(),
      hayConflicto: Boolean(this.activeConflict)
    };
    const decision = decidePendingAfterSave(estado);
    if (decision.tipo === 'nada') return false;

    this.pendingRemoteBoard = null;
    if (decision.tipo === 'conflicto') {
      this.publicarConflictoLocal(structuredClone(this.board), structuredClone(decision.board), decision.razon);
      return false;
    }

    this.applyBoard(structuredClone(decision.board));
    return true;
  }

  private boardsEqual(left: ChecklistBoard, right: ChecklistBoard): boolean {
    return boardsEqual(left, right);
  }

  private preparePendingRemoteBeforeSave(): boolean {
    if (!this.pendingRemoteBoard || this.hasActiveInteraction() || this.activeConflict) return false;

    const decision = decidePendingBeforeSave({
      local: this.board,
      ultimoAplicado: this.lastAppliedBoard,
      pendienteRemoto: this.pendingRemoteBoard
    });
    // El pendiente se consume en cuanto se decide qué hacer con él.
    this.pendingRemoteBoard = null;

    switch (decision.tipo) {
      case 'adopt':
        // El local no tenía cambios: se adopta el remoto y no hace falta guardar.
        this.applyBoard(structuredClone(decision.board));
        return true;
      case 'merge':
        // La fusión ya viene hecha: se aplica y se sigue adelante con el guardado.
        this.applyBoard(decision.board, false);
        return false;
      case 'conflicto':
        this.publicarConflictoLocal(structuredClone(this.board), structuredClone(decision.board), decision.razon);
        return true;
      default:
        // Sin pendiente no se llega hasta aquí (la guarda inicial ya retornó).
        return false;
    }
  }

  /**
   * Publica un conflicto surgido en la propia página (no en el repositorio): misma forma
   * que el del repositorio, para que el diálogo se muestre igual.
   */
  private publicarConflictoLocal(localBoard: ChecklistBoard, remoteBoard: ChecklistBoard, reason: string): void {
    this.activeConflict = {
      localBoard,
      remoteBoard,
      remoteUpdatedAt: '',
      reason
    };
    this.conflictFromRepository = false;
    this.conflictDialogOpen = false;
    this.conflictDialogDeferred = true;
    this.confirmingLocalConflict = false;
    this.saveError = '';
    this.presentDeferredConflict();
  }

  async refreshBoard(event: CustomEvent): Promise<void> {
    const refresher = event.target as { complete?: () => Promise<void> } | null;
    this.saveError = '';
    try {
      await this.session.refresh();
    } catch (error) {
      console.error('No se pudo actualizar el tablero', error);
      this.saveError = 'No se pudo actualizar el tablero. Comprueba la conexión e inténtalo de nuevo.';
    } finally {
      await refresher?.complete?.();
    }
  }

  closeConflictDialog(restoreFocus = true): void {
    this.conflictDialogOpen = false;
    this.confirmingLocalConflict = false;
    this.conflictDialogDeferred = false;
    if (restoreFocus) this.restoreConflictFocus();
    else this.conflictDialogOpener = null;
  }

  private restoreConflictFocus(): void {
    const opener = this.conflictDialogOpener;
    this.conflictDialogOpener = null;
    requestAnimationFrame(() => opener?.isConnected && opener.focus());
  }

  openConflictDialog(event?: Event): void {
    if (!this.activeConflict || !this.canShowConflictDialog()) return;
    const opener = event?.currentTarget;
    this.conflictDialogOpener = opener instanceof HTMLElement ? opener : null;
    this.conflictDialogOpen = true;
    this.conflictDialogDeferred = false;
    this.confirmingLocalConflict = false;
  }

  async resolveActiveConflict(resolution: 'remote' | 'local'): Promise<void> {
    const conflict = this.activeConflict;
    if (!conflict) return;
    // Resolver con el tablero local pide una confirmación aparte.
    if (pideDobleConfirmacion({ resolution, confirmandoLocal: this.confirmingLocalConflict })) {
      this.confirmingLocalConflict = true;
      return;
    }

    this.resolvingConflict = true;
    this.saveError = '';
    try {
      if (this.conflictFromRepository) {
        await this.session.resolveConflict(resolution);
      } else if (resolution === 'local') {
        await this.session.save(conflict.localBoard);
      }

      if (resolution === 'remote') {
        const remoteBoard = tableroRemotoParaResolver(conflict, this.pendingRemoteBoard);
        this.pendingRemoteBoard = null;
        this.activeConflict = null;
        this.conflictDialogDeferred = false;
        this.conflictFromRepository = false;
        this.conflictDialogOpen = false;
        this.confirmingLocalConflict = false;
        this.applyBoard(structuredClone(remoteBoard));
      } else {
        this.board = structuredClone(conflict.localBoard);
        this.lastAppliedBoard = structuredClone(this.board);
        this.pendingRemoteBoard = null;
        this.activeConflict = null;
        this.conflictDialogDeferred = false;
        this.conflictFromRepository = false;
        this.conflictDialogOpen = false;
        this.confirmingLocalConflict = false;
        this.scheduleMasonryLayout();
      }
      this.restoreConflictFocus();
    } catch (error) {
      console.error('No se pudo resolver el conflicto del tablero', error);
      if (!(error instanceof BoardMergeConflictError)) {
        this.saveError = 'No se pudo resolver el conflicto. Comprueba la conexión e inténtalo de nuevo.';
      }
    } finally {
      this.resolvingConflict = false;
    }
  }

  toggleAccountMenu(): void {
    if (this.accountMenuOpen) {
      this.closeAccountMenu();
      return;
    }
    if (this.focusListId || this.feedbackOpen || this.deleteDialogOpen || this.conflictDialogOpen || this.activeConflict || this.listToRemove) return;
    if (this.addingList) this.cancelAddList(false);
    this.accountMenuMobilePresentation = this.isMobilePresentation;
    this.accountMenuOpener = this.accountButton?.nativeElement ?? null;
    this.accountMenuOpen = true;
  }

  closeAccountMenu(immediate = false, restoreFocus = true): void {
    if (!this.accountMenuOpen) return;
    if (this.accountMenuClosing) {
      if (immediate) this.finishAccountMenuClose(restoreFocus);
      return;
    }
    if (!immediate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.accountMenuClosing = true;
      this.accountMenuCloseTimer = setTimeout(() => {
        this.finishAccountMenuClose(restoreFocus);
      }, 150);
      return;
    }
    this.finishAccountMenuClose(restoreFocus);
  }

  private finishAccountMenuClose(restoreFocus: boolean): void {
    if (this.accountMenuCloseTimer !== null) {
      clearTimeout(this.accountMenuCloseTimer);
      this.accountMenuCloseTimer = null;
    }
    this.accountMenuOpen = false;
    this.accountMenuClosing = false;
    const opener = this.accountMenuOpener;
    this.accountMenuOpener = null;
    if (restoreFocus) {
      requestAnimationFrame(() => {
        if (restoreFocus && opener?.isConnected) opener.focus();
      });
    }
  }

  private positionAccountMenu(): void {
    const menu = this.accountMenuNode;
    if (!menu) return;
    if (this.accountMenuMobilePresentation) {
      menu.style.top = '';
      menu.style.right = '';
      return;
    }
    const anchor = this.accountButton?.nativeElement.getBoundingClientRect();
    if (!anchor) return;
    const margin = 12;
    const top = Math.max(
      margin,
      Math.min(anchor.bottom + 8, window.innerHeight - menu.offsetHeight - margin)
    );
    const right = Math.max(margin, window.innerWidth - anchor.right);
    menu.style.top = `${top}px`;
    menu.style.right = `${right}px`;
  }

  @HostListener('window:resize')
  repositionAccountMenu(): void {
    this.positionAccountMenu();
  }

  keepFocusInsideAccountMenu(event: KeyboardEvent): void {
    this.keepFocusInsideOverlay(event, 'button:not([disabled]), a[href], [role="menuitemradio"]');
  }

  keepFocusInsideDialog(event: KeyboardEvent): void {
    this.keepFocusInsideOverlay(
      event,
      'button:not([disabled]), a[href], input:not([disabled]), ion-input, [tabindex]:not([tabindex="-1"])'
    );
  }

  private keepFocusInsideOverlay(event: KeyboardEvent, selector: string): void {
    if (event.key !== 'Tab') return;
    const container = event.currentTarget as HTMLElement | null;
    const items = container?.querySelectorAll<HTMLElement>(selector);
    if (!items?.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !container?.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !container?.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  /**
   * Aplica y persiste el color de este dispositivo. No se manda a ninguna nube: el color
   * es local, así que cerrar sesión no lo borra y otra cuenta del mismo dispositivo lo
   * hereda. El menú de perfil sigue abierto para poder seguir probando colores.
   */
  selectTheme(theme: BoardTheme): void {
    this.activeTheme = theme;
    this.applyTheme(theme);
    storeTheme(theme);
  }

  /** Cierra el menú de perfil y abre la pantalla de basurero. */
  async openTrash(): Promise<void> {
    this.closeAccountMenu(true, false);
    await this.router.navigateByUrl('/trash');
  }

  /** Abre la pantalla de archivo de listas desde el botón del header. */
  async openArchive(): Promise<void> {
    this.closeAccountMenu(true, false);
    await this.router.navigateByUrl('/archive');
  }

  async logout(): Promise<void> {
    this.closeAccountMenu(true, false);
    await this.auth.signOut();
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  // ── Eliminar cuenta ─────────────────────────────────────────────────────────

  /** Diálogo de eliminación de cuenta abierto. */
  deleteDialogOpen = false;
  /** Texto que escribe el usuario para confirmar; debe ser `ELIMINAR`. */
  deleteConfirmText = '';
  /** Se enciende mientras la petición de borrado está en vuelo. */
  deleteBusy = false;
  /** Error del último intento (en `aria-live` del diálogo); vacío si no hay. */
  deleteError = '';
  /** El id del usuario cuyo borrado se pidió; se captura antes de invocar. */
  private deleteUserId: string | null = null;

  /** Texto exacto que hay que escribir para habilitar la confirmación. */
  readonly deleteConfirmHint = DELETE_CONFIRM_TEXT;

  /** El botón de eliminar solo se habilita con el literal exacto y sin carga. */
  get canConfirmDelete(): boolean {
    return !this.deleteBusy && isDeleteConfirmText(this.deleteConfirmText);
  }

  /** Abre el diálogo: cierra el menú y limpia cualquier intento anterior. Solo en nativo. */
  openDeleteDialog(): void {
    if (!this.isNative || (this.boardModalOpen && !this.accountMenuOpen)) return;
    this.deleteDialogOpener = this.accountButton?.nativeElement ?? null;
    this.closeAccountMenu(true, false);
    this.deleteDialogOpen = true;
    this.deleteConfirmText = '';
    this.deleteBusy = false;
    this.deleteError = '';
    this.deleteUserId = null;
  }

  /** Cierra el diálogo (Escape o Cancelar); con carga en vuelo no hace nada. */
  cancelDeleteDialog(restoreFocus = true): void {
    if (this.deleteBusy) return;
    this.deleteDialogOpen = false;
    this.deleteConfirmText = '';
    this.deleteError = '';
    this.deleteUserId = null;
    const opener = this.deleteDialogOpener;
    this.deleteDialogOpener = null;
    if (restoreFocus) requestAnimationFrame(() => opener?.isConnected && opener.focus());
  }

  /**
   * Ejecuta el borrado. `AuthService.deleteAccount()` ya cierra la sesión local por
   * dentro (éxito y 401 persistente); aquí solo se limpia el tablero local y se navega.
   * Ante red/5xx la sesión sigue intacta y el diálogo muestra el error para reintentar.
   */
  async confirmDeleteAccount(): Promise<void> {
    if (!this.isNative) return;
    if (!this.canConfirmDelete) return;
    this.deleteBusy = true;
    this.deleteError = '';
    this.deleteUserId ??= this.auth.session?.user.id ?? null;
    const userId = this.deleteUserId;
    try {
      const resultado = await this.auth.deleteAccount();
      if (resultado.ok) {
        this.clearLocalUserData(userId);
        this.deleteDialogOpen = false;
        await this.router.navigateByUrl('/login', { replaceUrl: true });
        return;
      }
      if (resultado.reason === 'session-expired') {
        // La sesión local ya está cerrada por dentro: se limpia y se sale al login
        // con el aviso en el estado de navegación, para que el login lo muestre.
        // No es un éxito: si la cuenta sigue activa hay que repetir el borrado.
        this.clearLocalUserData(userId);
        this.deleteDialogOpen = false;
        this.deleteError = '';
        await this.router.navigate(['/login'], {
          replaceUrl: true,
          state: { deleteMessage: resultado.message },
        });
        return;
      }
      this.deleteError = resultado.message;
    } catch {
      this.deleteError = 'No se pudo eliminar la cuenta. Inténtalo de nuevo.';
    } finally {
      this.deleteBusy = false;
    }
  }

  /**
   * Limpia el tablero guardado en este dispositivo para el usuario borrado: su clave
   * (`the-lister-ionic-v1:<userId>`) y la heredada (`the-lister-ionic-v1`), que sirve
   * de semilla para el primer ingreso de cualquier cuenta. El color del dispositivo
   * (`the-lister-theme-v1`) se conserva a propósito: es compartido entre cuentas.
   * Nunca lanza: en modo privado o WebView sin almacenamiento no hay nada que borrar.
   */
  private clearLocalUserData(userId: string | null): void {
    try {
      if (userId) localStorage.removeItem(`the-lister-ionic-v1:${userId}`);
      localStorage.removeItem('the-lister-ionic-v1');
    } catch {
      /* noop */
    }
  }

  // ── Feedback ──────────────────────────────────────────────────────────────

  /**
   * Abre el modal de comentarios desde cualquiera de los dos puntos de entrada (botón
   * flotante o menú de perfil). Solo con sesión iniciada: sin ella la función respondería 401
   * y el usuario perdería el texto escrito.
   *
   * Al abrir se cierran TODAS las demás capas para que nunca haya dos overlays a la vez: el
   * menú de perfil, el modal de nueva lista, los diálogos de eliminar y de conflicto y la
   * búsqueda. Ninguno de ellos depende de estar abierto para funcionar.
   */
  openFeedback(opener?: HTMLElement): void {
    if (!this.feedbackEnabled) return;
    if (this.feedbackOpen) return;
    if (this.focusListId) return;

    this.closeAccountMenu(true, false);
    this.cancelAddList(false);
    this.cancelDeleteList();
    this.closeConflictDialog(false);
    this.conflictDialogDeferred = Boolean(this.activeConflict);
    this.closeSearch();
    if (!this.deleteBusy) {
      this.deleteDialogOpen = false;
      this.deleteError = '';
    }

    this.feedbackOpener = opener ?? null;
    this.feedbackOpen = true;
    // El diagnóstico solo lleva los tres números de conteo, nunca títulos ni contenido.
    this.feedback.setCounts({
      lists: this.board.lists.length,
      archivedLists: this.board.archivedLists?.length ?? 0,
      trashedLists: this.board.trashedLists?.length ?? 0
    });
  }

  /** Cierra el modal y devuelve el foco al botón que lo abrió. */
  closeFeedback(): void {
    if (!this.feedbackOpen) return;
    this.feedbackOpen = false;
    const opener = this.feedbackOpener;
    this.feedbackOpener = null;
    // El nodo que tenía el foco se desmonta en este mismo cambio, así que se devuelve después.
    setTimeout(() => opener?.focus?.(), 0);
  }

  // ── Recorrido de bienvenida ────────────────────────────────────────────────

  /**
   * Se llama en cuanto el tablero termina de cargar. Si ya se cumple todo, se abre; si
   * queda cualquier otro overlay por delante, queda pendiente y `ngDoCheck` lo abre
   * cuando la pila se vacíe. Nunca se muestran dos overlays a la vez.
   */
  private scheduleWelcomeTour(): void {
    this.welcomeTourDeferred = false;
    if (!this.welcomeTourDues()) return;
    if (this.canOpenWelcomeTour()) this.openWelcomeTour();
    else this.welcomeTourDeferred = true;
  }

  /**
   * Las reglas de aparición, resueltas contra el estado actual: marca ausente (una sola
   * por dispositivo y usuario, valida para las dos variantes), sin otro overlay y con
   * sesión iniciada. Si el almacenamiento local falla, la marca se lee como `error` y el
   * recorrido no se muestra: nunca entra en bucle.
   */
  private welcomeTourDues(): boolean {
    return shouldShowWelcome({
      seen: readWelcomeSeen(this.auth.session?.user.id ?? null),
      hasOverlay: this.overlayStack.topId !== null || this.sessionGuard.blocked() !== null,
      hasSession: Boolean(this.auth.session)
    });
  }

  /** Además de las reglas: el tablero tiene que estar cargado, sin error y activo. */
  private canOpenWelcomeTour(): boolean {
    return !this.welcomeTourOpen
      && !this.loadingBoard
      && !this.boardError
      && this.pageActive
      && this.welcomeTourDues();
  }

  /**
   * Abre el recorrido. Desde el menú de perfil se entra por aquí igual: la bandera de
   * «una vez por dispositivo» solo se escribe al cerrarlo (`closeWelcomeTour`), así que
   * volver a verlo a demanda no la consume. La variante se decide aquí, al abrir.
   */
  private openWelcomeTour(): void {
    this.welcomeTourDeferred = false;
    if (this.welcomeTourOpen) return;
    this.closeAccountMenu(true, false);
    this.closeSearch();
    this.welcomeTourVariant = welcomeVariant({ isNative: this.isNative, width: window.innerWidth });
    const previous = document.activeElement;
    this.welcomeTourOpener = previous instanceof HTMLElement
      ? previous
      : this.accountButton?.nativeElement ?? null;
    this.welcomeTourOpen = true;
  }

  /** «Guía de bienvenida» del menú de perfil (solo escritorio). */
  openWelcomeTourFromMenu(): void {
    this.openWelcomeTour();
  }

  /**
   * Cierra el recorrido desde cualquiera de sus salidas («Saltar», Escape, el fondo o
   * el botón de la última página) y marca la bandera de «visto» de este usuario: una vez
   * por dispositivo y cuenta. El foco vuelve al elemento que estaba antes de abrirse.
   */
  closeWelcomeTour(): void {
    if (!this.welcomeTourOpen) return;
    this.welcomeTourOpen = false;
    this.welcomeTourDeferred = false;
    markWelcomeSeen(this.auth.session?.user.id ?? null);
    const opener = this.welcomeTourOpener;
    this.welcomeTourOpener = null;
    // El nodo que tenía el foco se desmonta en este mismo cambio, así que se devuelve después.
    setTimeout(() => {
      if (opener?.isConnected) opener.focus();
    }, 0);
  }

  /** Escape cierra el diálogo de conflicto sin resolverlo y las demás capas abiertas. */
  @HostListener('document:keydown.escape', ['$event'])
  closeOverlaysOnEscape(event: KeyboardEvent): void {
    if (!this.pageActive) return;
    // Un arrastre de lista en curso se cancela antes que nada: el navegador además lo
    // interrumpe por su cuenta, y `dragend` recoge el resto.
    if (this.draggedListId) {
      event.preventDefault();
      this.cancelListDrag();
      return;
    }
    // El reordenamiento táctil (CDK) se cancela igual: el gesto se interrumpe y lo que
    // ya se había movido en pantalla vuelve a su sitio sin llegar a guardarse.
    if (this.cdkDragActive) {
      event.preventDefault();
      this.cancelCdkDrag();
      return;
    }
    // El modal de comentarios escucha el Escape en su propio overlay; si está abierto, es el
    // que decide (puede pedir confirmación de descarte). Aquí solo se cierran las demás capas.
    if (this.feedbackOpen) return;
    // El recorrido de bienvenida, cuando está abierto, es la única capa: se cierra y marca.
    if (this.welcomeTourOpen) {
      event.preventDefault();
      this.closeWelcomeTour();
      return;
    }
    // La edición activa es la capa superior: Escape la cancela sin cerrar el foco.
    // (El textarea también emite cancel; este es el respaldo para foco en botones.)
    if (this.editingTaskId || this.editingListId) {
      event.preventDefault();
      event.stopPropagation();
      this.cancelActiveEdit();
      return;
    }
    // El tooltip de zona horaria se come el primer Escape: el modal sigue abierto.
    if (this.hideUpdatedAtTooltipOnEscape()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (this.listToRemove) {
      event.preventDefault();
      this.cancelDeleteList();
      return;
    }
    if (this.focusListId) {
      event.preventDefault();
      this.closeFocusModal();
      return;
    }
    if (this.deleteDialogOpen) {
      event.preventDefault();
      this.cancelDeleteDialog();
      return;
    }
    if (this.conflictDialogOpen) {
      event.preventDefault();
      this.closeConflictDialog();
      return;
    }
    if (this.addingList) {
      event.preventDefault();
      this.cancelAddList();
      return;
    }
    if (this.accountMenuOpen) {
      event.preventDefault();
      this.closeAccountMenu();
    }
  }

  /** Aplica el tema a las variables CSS del tablero. */
  private applyTheme(theme: BoardTheme): void {
    this.boardBackground = theme.background;
    this.toolbarBackground = theme.toolbar;
    this.themeAccent = theme.accent;
    this.themeOnAccent = onAccentToken(pickOnAccent(theme.accent));
    this.themeFab = theme.fab;
    this.themeFabHover = theme.accent;
  }

  ngAfterViewInit(): void {
    this.boardItems.changes.subscribe(() => this.scheduleMasonryLayout());
    this.scheduleMasonryLayout();
  }

  ngOnDestroy(): void {
    this.pageActive = false;
    this.cancelListDrag();
    this.cancelCdkDrag();
    this.clearCdkSafetyTimer();
    this.overlayStack.unregisterOwner('board');
    this.mobilePresentationQuery?.removeEventListener('change', this.onMobilePresentationChange);
    this.mobilePresentationQuery = null;
    this.subscription?.unsubscribe();
    this.masonry.disconnect();
    if (this.accountMenuCloseTimer !== null) clearTimeout(this.accountMenuCloseTimer);
    if (this.focusNoticeTimer !== null) clearTimeout(this.focusNoticeTimer);
    this.clearFocusUpdatedAtTooltipTimer();
    this.clearNewListInputFocusWork();
    this.feedbackOpen = false;
  }

  private initializeMobilePresentation(): void {
    this.mobilePresentationQuery = window.matchMedia('(max-width: 700px)');
    this.isMobilePresentation = this.mobilePresentationQuery.matches;
    this.mobilePresentationQuery.addEventListener('change', this.onMobilePresentationChange);
  }

  // ✏️ Edición de título
  startEditTitle(): void {
    this.titleDraft = this.board.title;
    this.titleDraftCount = Array.from(this.titleDraft).length;
    this.editingTitle = true;
  }

  confirmEditTitle(): void {
    const newTitle = normalizeListTitle(this.titleDraft);
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
    this.titleDraftCount = 0;
    this.releasePendingRemoteBoard();
  }

  startEditList(list: ChecklistList, event: Event): void {
    event.stopPropagation();
    // Punto 7: se conserva el comportamiento actual — si había otra edición
    // activa, su borrador se descarta sin guardar ni avisar (se pisa).
    this.editingTaskId = null;
    this.taskTextDraft = '';
    this.editingListId = list.id;
    this.listTitleDraft = list.title;
    this.listTitleEditCount = Array.from(list.title).length;
    this.scheduleMasonryLayout();
  }

  async confirmEditList(list: ChecklistList): Promise<void> {
    // Un título que se queda vacío no es una edición: se cancela sin guardar.
    if (!editListTitle(list, this.listTitleDraft)) {
      this.cancelEditList();
      return;
    }
    this.cancelEditList();
    await this.persist();
  }

  cancelEditList(): void {
    this.editingListId = null;
    this.listTitleDraft = '';
    this.listTitleEditCount = 0;
    this.releasePendingRemoteBoard();
    this.scheduleMasonryLayout();
  }

  /** Cancela la edición activa (lista o tarea) sin guardar — capa superior de Escape/Atrás. */
  cancelActiveEdit(): void {
    if (this.editingListId) { this.cancelEditList(); return; }
    if (this.editingTaskId) this.cancelEditTask();
  }

  /** Actualiza el contador de caracteres al escribir en el input de nueva lista. */
  onNewListTitleInput(): void {
    this.newListTitleCount = Array.from(this.newListTitle).length;
  }

  /** Actualiza el contador al escribir en el editor de título (lo llama el componente). */
  onListTitleEditInput(value: string): void {
    this.listTitleDraft = value;
    this.listTitleEditCount = Array.from(value).length;
  }

  /** Actualiza el contador al escribir en el editor de título del tablero. */
  onTitleDraftInput(value: string): void {
    this.titleDraft = value;
    this.titleDraftCount = Array.from(value).length;
  }

  /** Normaliza el texto pegado en el editor de título del tablero y actualiza el contador. */
  onTitleDraftPaste(event: ClipboardEvent): void {
    const pasted = event.clipboardData?.getData('text') ?? '';
    const normalized = normalizeListTitle(pasted);
    this.titleDraft = normalized;
    this.titleDraftCount = Array.from(normalized).length;
    event.preventDefault();
  }

  /** Actualiza el borrador de tarea al escribir en el editor (lo llama el componente). */
  onTaskEditInput(value: string): void {
    this.taskTextDraft = value;
  }

  /** El autosize del editor cambió la altura: remaqueta masonry en el tablero. */
  onEditHeightChange(): void {
    this.scheduleMasonryLayout();
  }

  /** Normaliza el texto pegado en el input de nueva lista y actualiza el contador. */
  onNewListTitlePaste(event: ClipboardEvent): void {
    const pasted = event.clipboardData?.getData('text') ?? '';
    const normalized = normalizeListTitle(pasted);
    this.newListTitle = normalized;
    this.newListTitleCount = Array.from(normalized).length;
    event.preventDefault();
  }

  startEditTask(task: ChecklistTask, event: Event): void {
    event.stopPropagation();
    // Punto 7: se conserva el comportamiento actual — pisar sin avisar.
    if (this.editingListId) {
      this.editingListId = null;
      this.listTitleDraft = '';
      this.listTitleEditCount = 0;
    }
    this.editingTaskId = task.id;
    this.taskTextDraft = task.text;
    this.scheduleMasonryLayout();
  }

  async confirmEditTask(list: ChecklistList, task: ChecklistTask): Promise<void> {
    // El texto vacío se cancela en lugar de guardarse.
    if (!editTaskText(list, task, this.taskTextDraft)) {
      this.cancelEditTask();
      return;
    }
    this.cancelEditTask();
    await this.persist();
  }

  cancelEditTask(): void {
    this.editingTaskId = null;
    this.taskTextDraft = '';
    this.releasePendingRemoteBoard();
    this.scheduleMasonryLayout();
  }

  isEditingTask(taskId: string): boolean {
    return this.editingTaskId === taskId;
  }

  // ✨ Toggle del modal de creación desde el FAB
  toggleAddList(): void {
    if (!this.addingList && this.isAtListLimit) return;
    if (!this.addingList && (
      this.focusListId || this.feedbackOpen || this.deleteDialogOpen || this.conflictDialogOpen || this.listToRemove || this.activeConflict
    )) return;
    if (!this.addingList && this.accountMenuOpen) {
      this.closeAccountMenu(true, false);
    }
    if (!this.addingList) this.newListMobilePresentation = this.isMobilePresentation;
    this.addingList = !this.addingList;
    if (this.addingList) {
      this.newListOpener = this.newListFab?.nativeElement ?? null;
      this.newListTitle = '';
      this.newListTitleCount = 0;
      this.selectedVisualColor = this.visualColors[0].value;
      this.placeNewListAtStart = false;
      this.newListTitleFocusTimer = setTimeout(() => {
        this.newListTitleFocusTimer = null;
        this.focusNewListTitleAfterEntrance();
      }, 220);
    }
  }

  submitNewListFromInput(event: Event): void {
    event.preventDefault();
    void this.addList();
  }

  onAddListBackdropClick(): void {
    if (!this.newListTitle.trim()) this.cancelAddList();
  }

  onNewListEntranceAnimationEnd(event: AnimationEvent): void {
    if (event.target !== event.currentTarget || !this.addingList) return;
    this.focusNewListTitleAfterEntrance();
  }

  private focusNewListTitleAfterEntrance(): void {
    if (!this.addingList || !this.newListTitleInput) return;
    if (this.newListTitleFocusTimer !== null) {
      clearTimeout(this.newListTitleFocusTimer);
      this.newListTitleFocusTimer = null;
    }
    void this.focusNewListTitleInput();
  }

  private async focusNewListTitleInput(): Promise<void> {
    const input = this.newListTitleInput;
    if (!this.addingList || !input) return;
    await input.setFocus();
    if (!this.addingList || input !== this.newListTitleInput) return;
    const nativeInput = await input.getInputElement();
    const scrollIfNeeded = (): void => {
      if (!this.addingList || !nativeInput.isConnected) return;
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const bounds = nativeInput.getBoundingClientRect();
      if (bounds.top < viewportTop || bounds.bottom > viewportBottom) {
        nativeInput.scrollIntoView({ block: 'nearest' });
      }
    };
    this.newListViewportResizeHandler = () => {
      window.visualViewport?.removeEventListener('resize', this.newListViewportResizeHandler!);
      this.newListViewportResizeHandler = null;
      scrollIfNeeded();
    };
    window.visualViewport?.addEventListener('resize', this.newListViewportResizeHandler, { once: true });
    this.newListViewportTimer = setTimeout(() => {
      if (this.newListViewportResizeHandler) {
        window.visualViewport?.removeEventListener('resize', this.newListViewportResizeHandler);
        this.newListViewportResizeHandler = null;
      }
      this.newListViewportTimer = null;
      scrollIfNeeded();
    }, 250);
  }

  private clearNewListInputFocusWork(): void {
    if (this.newListTitleFocusTimer !== null) clearTimeout(this.newListTitleFocusTimer);
    if (this.newListViewportTimer !== null) clearTimeout(this.newListViewportTimer);
    if (this.newListViewportResizeHandler) {
      window.visualViewport?.removeEventListener('resize', this.newListViewportResizeHandler);
    }
    this.newListTitleFocusTimer = null;
    this.newListViewportTimer = null;
    this.newListViewportResizeHandler = null;
  }

  // 🔍 Búsqueda
  toggleSearch(): void {
    this.searching = !this.searching;
    if (!this.searching) this.clearSearch();
  }

  /**
   * Atajo ⌘K (solo macOS web): lleva el foco al buscador y selecciona lo que haya para
   * poder escribir encima. Escape no se toca: sigue cerrando overlays y la búsqueda.
   */
  @HostListener('document:keydown', ['$event'])
  onSearchShortcut(event: KeyboardEvent): void {
    if (!this.pageActive) return;
    if (!this.showSearchShortcut) return;
    // Con el recorrido de bienvenida abierto el tablero queda inerte: el atajo no roba el foco.
    if (this.welcomeTourOpen) return;
    if (!event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key.toLowerCase() !== 'k') return;
    event.preventDefault();
    this.focusSearch();
  }

  private focusSearch(): void {
    this.searching = true;
    const input = this.searchInput;
    if (!input) return;
    void input.setFocus();
    void input.getInputElement().then((nativeInput) => nativeInput?.select());
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

  onBrandClick(event: MouseEvent): void {
    if (event.defaultPrevented) {
      return;
    }
    const content = this.boardContent;
    if (!content) {
      return;
    }
    void content.getScrollElement().then((scrollEl) => {
      if (scrollEl.scrollTop <= 0) {
        return;
      }
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const duration = prefersReducedMotion ? 0 : 300;
      content.scrollToTop(duration);
    });
  }

  getHighlightedSegments(title: string): { text: string; highlight: boolean }[] {
    return getHighlightedSegments(title, this.searchQuery);
  }

  /**
   * Listas en el orden en que se dibujan: la fijada primero y el resto por `position`, el
   * orden estable guardado. Es el mismo orden en todos los dispositivos y no cambia al
   * recargar. La búsqueda filtra sobre ese mismo orden, así que no lo altera.
   */
  get visibleLists(): ChecklistList[] {
    const ordered = orderedLists(this.board);
    if (this.searching && this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      return ordered.filter((l) => l.title.toLowerCase().includes(q));
    }
    return ordered;
  }

  isPinned(list: ChecklistList): boolean {
    return isPinned(this.board, list.id);
  }

  /** Fija una lista al inicio del tablero, reemplazando a la que estaba pinneada. */
  async pinList(list: ChecklistList): Promise<void> {
    // La fijada se dibuja primera por `orderedLists`, sin tocar `position`: el pin no
    // reordena el tablero, solo cambia qué lista va delante.
    if (!pinList(this.board, list.id)) return;
    await this.persist();
  }

  /**
   * Deja una sola lista pinneada. Si el pin apunta a una lista que ya no está en el
   * tablero (la acaba de descartar el usuario) o si el tablero aún no tenía ninguna,
   * la primera lista por `position` asume el pin. `position` es el orden estable
   * guardado, así que la elección es la misma en todos los dispositivos. Devuelve si
   * hubo que corregirlo, para avisar que el tablero debe guardarse.
   */
  private syncPinnedList(): boolean {
    return syncPinnedList(this.board);
  }

  pendingTasks(list: ChecklistList): ChecklistTask[] {
    return pendingTasks(list);
  }

  completedTasks(list: ChecklistList): ChecklistTask[] {
    return completedTasks(list);
  }

  isCompletedExpanded(listId: string): boolean {
    return this.expandedCompleted.has(listId);
  }

  visibleCompletedTasks(list: ChecklistList): ChecklistTask[] {
    return visibleCompletedTasks(list, this.isCompletedExpanded(list.id));
  }

  hiddenCompletedCount(list: ChecklistList): number {
    return hiddenCompletedCount(list);
  }

  shouldShowCompletedToggle(list: ChecklistList): boolean {
    return shouldShowCompletedToggle(list);
  }

  toggleCompletedTasks(list: ChecklistList, event?: Event): void {
    const wasExpanded = this.expandedCompleted.has(list.id);
    if (wasExpanded) this.expandedCompleted.delete(list.id);
    else this.expandedCompleted.add(list.id);

    const target = event?.currentTarget;
    if (target instanceof HTMLElement) {
      requestAnimationFrame(() => {
        target.focus();
        if (wasExpanded) {
          target.scrollIntoView({ block: 'nearest' });
        }
      });
    }

    this.scheduleMasonryLayout();
  }

  completedTaskCount(list: ChecklistList): number {
    return completedTaskCount(list);
  }

  listProgressPercent(list: ChecklistList): number {
    return listProgressPercent(list);
  }

  /** Una lista está terminada cuando tiene tareas y todas están marcadas. */
  isListComplete(list: ChecklistList): boolean {
    return isListComplete(list);
  }

  taskCounterLabel(list: ChecklistList): string {
    return taskCounterLabel(list);
  }

  isCollapsed(listId: string): boolean {
    return this.collapsed.has(listId);
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  async addTask(list: ChecklistList, input?: IonInput): Promise<void> {
    const creada = addTaskToList(list, this.taskDrafts[list.id] ?? '');
    if (!creada) return;
    this.taskDrafts[list.id] = '';
    // Mantener el foco en el input para poder añadir varias tareas seguidas.
    input?.setFocus();
    await this.persist();
  }

  async toggleTask(list: ChecklistList, task: ChecklistTask): Promise<void> {
    if (!toggleTask(list, task.id)) return;
    await this.persist();
  }

  async deleteTask(list: ChecklistList, taskId: string): Promise<void> {
    if (!deleteTask(list, taskId)) return;
    await this.persist();
  }

  /**
   * Descarta la lista al basurero en lugar de borrarla: queda guardada 7 días
   * y se puede restaurar desde la pantalla de Basurero.
   */
  async moveListToTrash(list: ChecklistList): Promise<void> {
    if (!moveListToTrash(this.board, list.id)) return;
    this.collapsed.delete(list.id);
    this.expandedCompleted.delete(list.id);
    await this.persist();
  }

  /**
   * Archiva una lista 100% completa: sale del tablero y queda guardada 60 días en la
   * pantalla de Archivo, desde donde se puede restaurar o eliminar para siempre.
   * Mismo recorrido que el basurero (las posiciones y el pin se reajustan igual).
   */
  async moveListToArchive(list: ChecklistList): Promise<void> {
    if (!moveListToArchive(this.board, list.id)) return;
    this.collapsed.delete(list.id);
    this.expandedCompleted.delete(list.id);
    await this.persist();
  }

  /**
   * El botón de la cabecera hace una cosa u otra según la lista: las completas se
   * archivan (el ícono de bandeja lo indica) y las incompletas van al basurero.
   * Se guarda el botón que lo abrió (`event.currentTarget`, no `event.target`, que puede
   * ser el <ion-icon> que hay dentro) para devolverle el foco al cerrar el diálogo.
   */
  requestRemoveList(list: ChecklistList, event?: Event | null): void {
    // Con el diálogo de sincronización abierto no se apila un segundo overlay encima.
    if (this.conflictDialogOpen || this.feedbackOpen || this.addingList
      || this.deleteDialogOpen || this.accountMenuOpen) return;
    this.listToRemove = list;
    const opener = event?.currentTarget;
    this.removeDialogOpener = opener instanceof HTMLElement ? opener : null;
  }

  cancelDeleteList(): void {
    if (this.removeDialogBusy) return;
    this.closeRemoveDialog();
  }

  async confirmDeleteList(): Promise<void> {
    const list = this.listToRemove;
    if (!list || this.removeDialogBusy) return;
    this.setFocusRemovalCause(list, this.isListComplete(list) ? 'archived' : 'trashed');
    this.closeRemoveDialog();
    if (this.isListComplete(list)) await this.moveListToArchive(list);
    else await this.moveListToTrash(list);
  }

  /**
   * "Archivar lista" del diálogo de una lista completa: el recorrido es exactamente el de
   * `confirmDeleteList`, pero explícito para que el botón no dependa de que la lista siga
   * siendo completa en el momento de pulsar.
   */
  async archiveListFromDialog(): Promise<void> {
    await this.runRemoveDialogAction((list) => this.moveListToArchive(list), 'archived');
  }

  /**
   * "Eliminar" del diálogo de una lista completa: mueve la lista al BASURERO con la misma
   * `moveListToTrash` que usa el botón de la cabecera, no la duplica. No es un borrado
   * definitivo: la lista se puede restaurar durante `TRASH_RETENTION_DAYS` días.
   */
  async trashListFromDialog(): Promise<void> {
    await this.runRemoveDialogAction((list) => this.moveListToTrash(list), 'trashed');
  }

  /**
   * Ejecuta una acción del diálogo de archivar. `removeDialogBusy` deja los tres botones
   * deshabilitados mientras dura, así que por apertura del diálogo solo sale una acción:
   * un doble clic en "Archivar lista" o en "Eliminar" no mueve la lista dos veces.
   */
  private async runRemoveDialogAction(
    run: (list: ChecklistList) => Promise<void>,
    cause: FocusListRemovalCause
  ): Promise<void> {
    const list = this.listToRemove;
    if (!list || this.removeDialogBusy) return;
    this.setFocusRemovalCause(list, cause);
    this.removeDialogBusy = true;
    this.closeRemoveDialog();
    try {
      await run(list);
    } finally {
      this.removeDialogBusy = false;
    }
  }

  /** Cierra el diálogo de archivar y devuelve el foco al botón de la lista que lo abrió. */
  private closeRemoveDialog(restoreFocus = true): void {
    this.listToRemove = null;
    const opener = this.removeDialogOpener;
    this.removeDialogOpener = null;
    // Tras archivar o mover al basurero la tarjeta ya no existe en el tablero: el botón
    // quedó desconectado y no hay a quién devolverle el foco.
    if (opener?.isConnected) opener.focus();
  }

  /**
   * El foco entra en el diálogo por la acción principal y segura ("Archivar lista"), no por
   * "Eliminar". Solo se aplica al diálogo de archivar: el del basurero conserva su `autofocus`
   * en "Cancelar" de siempre.
   */
  private focusRemoveDialogPrimary(): void {
    this.removeDialogPrimaryElement?.focus();
  }

  /**
   * Mantiene el foco dentro del diálogo: Tab recorre sus botones en orden y al llegar al
   * último vuelve al primero (y al revés con Shift+Tab), sin salirse a la página de detrás.
   */
  keepFocusInsideRemoveDialog(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const dialog = event.currentTarget as HTMLElement | null;
    const buttons = dialog?.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
    if (!buttons || buttons.length < 2) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog?.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  /**
   * Textos del diálogo de la cabecera. Se resuelven aquí para que la plantilla no repita
   * la condición: una lista completa se archiva y una incompleta va al basurero.
   */
  get isArchiving(): boolean {
    return this.listToRemove !== null && this.isListComplete(this.listToRemove);
  }

  get removeDialogTitle(): string {
    return this.isArchiving ? '¿Archivar esta lista?' : '¿Deseas eliminar esta lista?';
  }

  get removeDialogMessage(): string {
    if (this.isArchiving) {
      return `La lista se moverá al archivo y se eliminará permanentemente después de ${ARCHIVE_RETENTION_DAYS} días. `
        + 'Mientras tanto podrás restaurarla desde el Archivo.';
    }
    return `La lista se moverá al basurero y se eliminará permanentemente después de ${TRASH_RETENTION_DAYS} días. `
      + 'Mientras tanto podrás restaurarla desde el Basurero.';
  }

  get removeDialogIcon(): string {
    return this.isArchiving ? 'archive-outline' : 'trash';
  }

  get removeDialogActionLabel(): string {
    return this.isArchiving ? 'Archivar lista' : 'Eliminar lista';
  }

  /**
   * title y aria-label de "Eliminar": aclaran que la lista va al BASURERO y no se borra,
   * con el plazo de restauración tomado de la constante del basurero.
   */
  get removeDialogTrashHint(): string {
    return `Mover al basurero (se puede restaurar durante ${TRASH_RETENTION_DAYS} días)`;
  }

  toggleCollapsed(listId: string): void {
    if (this.collapsed.has(listId)) this.collapsed.delete(listId);
    else this.collapsed.add(listId);
    this.scheduleMasonryLayout();
  }

  /**
   * Crea una lista al final del tablero (o al inicio si se pidió "ubicar al inicio").
   * El orden de la rejilla es el de `position`, que `addListToBoard` renumera, así que una
   * lista nueva aparece siempre al final salvo que quede pinneada al inicio.
   */
  async addList(): Promise<void> {
    if (!this.addingList) return;
    // El título se normaliza dentro: si se queda vacío o el tablero está en el límite,
    // no se crea nada y el formulario sigue abierto para corregirlo.
    const creada = addListToBoard(this.board, this.newListTitle, {
      alInicio: this.placeNewListAtStart,
      colorVisual: this.selectedVisualColor
    });
    if (!creada) return;
    this.clearNewListInputFocusWork();
    this.newListTitle = '';
    this.addingList = false;
    this.newListTitleCount = 0;
    this.restoreNewListFocus();
    await this.persist();
  }

  cancelAddList(restoreFocus = true): void {
    this.addingList = false;
    this.clearNewListInputFocusWork();
    this.newListTitle = '';
    this.newListTitleCount = 0;
    this.releasePendingRemoteBoard();
    if (restoreFocus) this.restoreNewListFocus();
    else this.newListOpener = null;
  }

  private restoreNewListFocus(): void {
    const opener = this.newListOpener;
    this.newListOpener = null;
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
    });
  }

  onTaskDraftBlur(): void {
    this.releasePendingRemoteBoard();
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
    if (!this.draggedTask) return;
    if (!dropTask(this.board, this.draggedTask, targetList.id, targetTaskId)) return;
    this.draggedTask = null;
    await this.persist();
  }

  async dropTaskInList(targetList: ChecklistList, event: DragEvent): Promise<void> {
    event.preventDefault();
    if (!this.draggedTask) return;
    if (!dropTaskInList(this.board, this.draggedTask, targetList.id)) return;
    this.draggedTask = null;
    await this.persist();
  }

  /** Las listas ya no se arrastran; solo queda el reordenamiento de tareas dentro de la lista. */
  clearTaskDragState(): void {
    this.draggedTask = null;
    this.releasePendingRemoteBoard();
  }

  // ── Arrastre de listas (solo vista de lista, escritorio web) ────────────────────

  /**
   * El reordenamiento de listas es de escritorio: hace falta ratón (o su alternativa con
   * teclado) y la rejilla masonry, así que se desactiva en la app nativa, en pantallas de
   * 700px o menos y con la búsqueda abierta. Sin handle no hay nada que arrastrar.
   */
  get listDragEnabled(): boolean {
    return !this.isNative && !this.isMobilePresentation && !this.searching
      && resolveReorderEngine({ touch: this.deviceHasTouch(), width: window.innerWidth }) === 'html5';
  }

  /**
   * ¿La rejilla va en flujo normal? Con UNA columna el masonry no hace falta y estorba:
   * CDK reordena moviendo nodos del DOM, y con `position:absolute` + `top` en línea el
   * nodo se mueve pero la posición no. La decisión es pura (`resolveBoardFlowMode`, con
   * la misma histéresis que las columnas) y se toma en `scheduleMasonryLayout`.
   */
  get usesFlowLayout(): boolean {
    return !this.cardsViewActive && this.flowMode;
  }

  /** ¿Se está arrastrando esta lista? La tarjeta se atenúa mientras tanto. */
  isListDragging(listId: string): boolean {
    return this.draggedListId === listId;
  }

  /** ¿Es esta la tarjeta sobre la que caería la lista arrastrada? Pinta el indicador. */
  isListDropTarget(listId: string): boolean {
    return this.listDropTargetId === listId;
  }

  /**
   * Empieza el arrastre de una lista desde el handle de su cabecera. La lista fijada no se
   * mueve nunca, así que su handle va deshabilitado y no llega aquí.
   *
   * La tarjeta entera es la imagen de arrastre: es lo que se ve bajo el cursor, no el
   * handle de 26px.
   */
  startListDrag(list: ChecklistList, event: DragEvent): void {
    if (!this.listDragEnabled || this.isPinned(list)) return;
    event.stopPropagation();
    this.draggedListId = list.id;
    setListDragPayload(event.dataTransfer, list.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    const card = (event.currentTarget as HTMLElement | null)?.closest('.checklist-column');
    event.dataTransfer?.setDragImage(card ?? (event.currentTarget as Element), 20, 20);
    // Las escuchas van en el documento y en fase de captura: así el arrastre de una lista
    // manda sobre el de las tareas aunque se suelte encima de una (las tareas no se enteran).
    document.addEventListener('dragover', this.onListDragOverDocument, true);
    document.addEventListener('drop', this.onListDropDocument, true);
  }

  /**
   * Destino del arrastre: la tarjeta que hay bajo el cursor, leída del `data-list-id`.
   *
   * Con el maquetado masonry de tres columnas el orden lógico NO es el de lectura en filas:
   * las tarjetas se apilan en la columna más corta, así que la que está «debajo» puede ir
   * varias posiciones más tarde. Por eso el destino se calcula por el elemento sobre el que
   * está el puntero (que es la tarjeta bajo el cursor, porque la arrastrada tiene
   * `pointer-events: none`) y no por una cuenta de filas y columnas. Si el puntero no está
   * sobre ninguna tarjeta —el hueco entre columnas o el espacio vacío de debajo— el destino
   * es `null`, que significa «al final del tablero».
   */
  private resolveListDropTargetId(event: DragEvent): string | null {
    const target = event.target;
    const card = target instanceof Element ? target.closest('.checklist-column') : null;
    return card instanceof HTMLElement ? card.dataset['listId'] ?? null : null;
  }

  /**
   * Mientras se arrastra una lista hay que dejar claro dónde va a caer. `preventDefault`
   * es obligatorio en cada `dragover`: sin él el navegador rechaza el soltable y el drop
   * nunca llega.
   */
  private onListDragOver(event: DragEvent): void {
    if (!this.draggedListId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.listDropTargetId = this.resolveListDropTargetId(event);
  }

  /** El puntero sale del tablero: el indicador se apaga hasta que vuelva a entrar. */
  onListDragLeave(event: DragEvent): void {
    if (!this.draggedListId) return;
    const next = event.relatedTarget;
    const container = event.currentTarget;
    if (next instanceof Node && container instanceof Node && container.contains(next)) return;
    this.listDropTargetId = null;
  }

  /**
   * Suelta la lista: se coloca delante de la tarjeta de destino, o al final si se suelta en
   * el espacio vacío. Las tareas no se enteran del drop (la escucha es de captura y corta
   * la propagación), y un soltable que no traiga el id de la lista en el `dataTransfer` se
   * ignora.
   */
  private async onListDrop(event: DragEvent): Promise<void> {
    const draggedId = this.draggedListId;
    if (!draggedId) return;
    event.preventDefault();
    event.stopPropagation();
    // El soltable tiene que ser el arrastre de esta lista. Si el `dataTransfer` dice otra
    // cosa (una tarea, un archivo) se descarta; si no se puede leer, el estado propio de la
    // página ya basta para saber que el arrastre salió de aquí.
    const payload = readListDragPayload(event.dataTransfer);
    if (payload !== null && payload !== draggedId) {
      this.cancelListDrag();
      return;
    }
    await this.moveListTo(draggedId, this.resolveListDropTargetId(event));
  }

  /**
   * Aplica el reordenamiento: una sola escritura por arrastre, con el masonry recolocado
   * una vez (sin saltos de scroll ni parpadeo).
   */
  private async moveListTo(listId: string, targetId: string | null): Promise<void> {
    this.cancelListDrag();
    if (!moveListBefore(this.board, listId, targetId)) return;
    this.scheduleMasonryLayout();
    await this.persist();
  }

  /** Cancela el arrastre en curso: se llama al soltar, con Escape y al salir de la tarjeta. */
  cancelListDrag(): void {
    this.draggedListId = null;
    this.listDropTargetId = null;
    document.removeEventListener('dragover', this.onListDragOverDocument, true);
    document.removeEventListener('drop', this.onListDropDocument, true);
  }

  // ── Reordenamiento táctil con CDK (vista Tarjetas y vista de lista) ───────────

  /**
   * Empieza el arrastre. La tarjeta fijada lleva `cdkDragDisabled`, así que aquí solo
   * llegan las movibles. Se abre el registro de overlay para que Atrás cancele el gesto
   * en lugar de salir de la app.
   */
  onCdkDragStart(drag: CdkDrag<ChecklistList>): void {
    this.activeCdkDrag = drag;
    this.cdkDragActive = true;
    this.cdkDraggedListId = drag.data?.id ?? null;
    this.cdkSuppressDrop = false;
    this.cdkSuppressClickUntil = Date.now() + CARD_CLICK_SUPPRESS_MS + 50;
    this.armCdkSafetyTimer();
    void this.measureCdkScrollElement();
    this.syncOverlayStack();
  }

  /** El dedo se mueve: se guarda la posición y se arma el auto-scroll propio. */
  onCdkDragMove(event: CdkDragMove<ChecklistList>): void {
    this.cdkPointerY = event.pointerPosition.y;
    this.armCdkAutoScroll();
  }

  onCdkDragRelease(): void {
    // Nada que hacer: el soltable llega por `cdkDropListDropped`.
  }

  /**
   * Fin del arrastre, venga de un soltable, de una cancelación o del fin del gesto. Limpia
   * siempre el estado para que no quede nada colgado.
   *
   * OJO: si la lista arrastrada DESAPARECE a mitad del gesto (una actualización remota la
   * borra), CDK NO emite este evento; el estado se limpia entonces al reemplazar el tablero
   * (`clearCdkDragIfListVanished`).
   */
  onCdkDragEnd(): void {
    this.cdkSuppressClickUntil = Date.now() + CARD_CLICK_SUPPRESS_MS;
    this.endCdkDrag();
  }

  /**
   * Suelta la lista: se traduce el par de índices de CDK a la regla de negocio y se
   * guarda UNA sola vez. Sin lógica de orden aquí: la traducción está en
   * `cdk-reorder.planCdkReorder`.
   */
  async onCdkDrop(event: CdkDragDrop<ChecklistList[]>): Promise<void> {
    const plan = planCdkReorder({
      visibleIds: this.visibleLists.map((list) => list.id),
      previousIndex: event.previousIndex,
      currentIndex: event.currentIndex,
      pinnedListId: this.board.pinnedListId ?? null,
      searching: this.searching
    });
    // Una cancelación (Atrás o Escape) llega como soltable: se descarta el movimiento.
    const cancelado = this.cdkSuppressDrop;
    this.cdkSuppressDrop = false;
    this.endCdkDrag();
    if (cancelado) return;
    if (!plan) return;
    if (!moveListBefore(this.board, plan.listId, plan.targetId)) return;
    const order = orderedLists(this.board);
    const index = order.findIndex((item) => item.id === plan.listId);
    const moved = order[index];
    if (moved) this.listAnnouncement = listMoveAnnouncement(moved.title, index, order.length);
    this.scheduleMasonryLayout();
    await this.persist();
  }

  /**
   * Cancela el arrastre táctil en curso.
   *
   * `reset()` de CDK NO cancela: solo devuelve la tarjeta a su sitio si la secuencia ya
   * había terminado. El mecanismo comprobado es sintetizar el final del gesto (CDK
   * escucha `touchend`/`mouseup` en el documento en fase de captura, igual que con un
   * dedo real) y marcarlo como cancelado, para que el soltable resultante no reordene.
   */
  cancelCdkDrag(): void {
    if (!this.cdkDragActive) {
      this.endCdkDrag();
      return;
    }
    this.cdkSuppressDrop = true;
    this.stopCdkAutoScroll();
    document.dispatchEvent(
      new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [] })
    );
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    this.activeCdkDrag?.reset();
    this.endCdkDrag();
  }

  /** Limpieza común a todos los finales del arrastre. */
  private endCdkDrag(): void {
    this.cdkDragActive = false;
    this.activeCdkDrag = null;
    this.cdkDraggedListId = null;
    this.cdkPointerY = 0;
    this.cdkScrollElement = null;
    this.stopCdkAutoScroll();
    this.clearCdkSafetyTimer();
    this.syncOverlayStack();
  }

  /**
   * La lista que se estaba arrastrando ha desaparecido del tablero (una actualización
   * remota la borró): si el arrastre seguía activo, hay que limpiarlo. Sin esto el estado
   * se quedaría colgado hasta el temporizador de seguridad, bloqueando el remoto pendiente
   * y dejando registrado el overlay de Atrás. Lo comprobó el spike de la Tarea 2.
   */
  private clearCdkDragIfListVanished(): void {
    if (!this.cdkDragActive || this.cdkDraggedListId === null) return;
    const sigueAqui = orderedLists(this.board).some((list) => list.id === this.cdkDraggedListId);
    if (!sigueAqui) {
      this.cdkSuppressDrop = true;
      this.stopCdkAutoScroll();
      this.endCdkDrag();
    }
  }

  /** Red de seguridad: un arrastre que no termine por sí solo se limpia a los 30 s. */
  private armCdkSafetyTimer(): void {
    this.clearCdkSafetyTimer();
    this.cdkSafetyTimer = setTimeout(() => this.endCdkDrag(), CDK_DRAG_SAFETY_TIMEOUT_MS);
  }

  private clearCdkSafetyTimer(): void {
    if (this.cdkSafetyTimer !== null) clearTimeout(this.cdkSafetyTimer);
    this.cdkSafetyTimer = null;
  }

  /**
   * Auto-scroll propio. CDK no ve el scroller de `ion-content` (vive en su shadow DOM),
   * así que su auto-scroll se desactiva y se escribe aquí: cerca del borde, la velocidad
   * crece con la cercanía y arranca lenta. El bucle se cancela al soltar o cancelar.
   */
  private async measureCdkScrollElement(): Promise<void> {
    this.cdkScrollElement = (await this.boardContent?.getScrollElement()) ?? null;
  }

  private armCdkAutoScroll(): void {
    if (this.cdkAutoScrollFrame) return;
    const tick = (): void => {
      // Defensa de ciclo de vida: si el arrastre ya terminó por una vía que no pasó por
      // `endCdkDrag` (una tarjeta que desaparece, un gesto que CDK aborta), el bucle se
      // para en el siguiente fotograma en lugar de seguir midiendo y desplazando.
      if (!this.cdkDragActive) {
        this.stopCdkAutoScroll();
        return;
      }
      this.cdkAutoScrollFrame = requestAnimationFrame(tick);
      const scroll = this.cdkScrollElement;
      if (!scroll) return;
      const rect = scroll.getBoundingClientRect();
      const step = autoScrollStepFor(this.cdkPointerY, rect.top, rect.bottom);
      if (step === 0) return;
      void this.boardContent?.scrollByPoint(0, step, 0);
      // El contenido se ha movido bajo el dedo: hay que decírselo a CDK.
      this.notifyCdkScroll(step);
    };
    this.cdkAutoScrollFrame = requestAnimationFrame(tick);
  }

  /**
   * Avisa a CDK de que acabamos de desplazar el contenido `step` píxeles hacia abajo.
   *
   * Sin esto, el hueco se queda atrás: el scroller de `ion-content` vive en su shadow DOM
   * y el evento `scroll` no cruza la frontera, así que CDK nunca se enteraba de nuestro
   * auto-scroll. Con `MixedSortStrategy` esto vuelve a calcular el destino contra lo que
   * hay realmente bajo el puntero; con `SingleAxisSortStrategy` (`vertical`) corrige además
   * sus rects en caché, que es la deriva que se vio al arrastrar hacia abajo.
   *
   * El signo es el contrario al del desplazamiento: si el contenido baja, cada tarjeta
   * sube en el viewport (`topDifference = -step`), igual que calcula CDK con su propio
   * listener de scroll.
   */
  private notifyCdkScroll(step: number): void {
    const strategy = (
      this.boardDropList as unknown as
        | { _dropListRef?: { _sortStrategy?: CdkScrollStrategyShape } }
        | undefined
    )?._dropListRef?._sortStrategy;
    const notice = cdkScrollNotice(step);
    strategy?.updateOnScroll?.(notice.top, notice.left);
  }

  private stopCdkAutoScroll(): void {
    if (this.cdkAutoScrollFrame) cancelAnimationFrame(this.cdkAutoScrollFrame);
    this.cdkAutoScrollFrame = 0;
  }

  /**
   * Toque sobre una tarjeta en vista Tarjetas. Durante el arrastre y un instante después
   * no abre el modal: el clic que emite el navegador al levantar el dedo no es una
   * decisión del usuario. El clic siguiente sí abre.
   */
  onCardClick(list: ChecklistList, event: Event): void {
    if (!shouldOpenCardFocus({
      dragActive: this.cdkDragActive,
      suppressClickUntil: this.cdkSuppressClickUntil,
      now: Date.now()
    })) {
      this.cdkSuppressClickUntil = 0;
      return;
    }
    this.openListFocus(list, event);
  }

  /**
   * Acciones de la CABECERA de la vista de lista (título, chevron). Misma comprobación de
   * supresión que el toque sobre la tarjeta: si el usuario acaba de arrastrar, el clic que
   * emite el navegador al levantar el dedo no debe abrir el modal de enfoque.
   */
  onListHeaderAction(list: ChecklistList, event: Event): void {
    if (!shouldOpenCardFocus({
      dragActive: this.cdkDragActive,
      suppressClickUntil: this.cdkSuppressClickUntil,
      now: Date.now()
    })) {
      this.cdkSuppressClickUntil = 0;
      return;
    }
    this.openListFocus(list, event);
  }

  /**
   * Alternativa al ratón: con el handle enfocado, Alt + flecha mueve la lista una posición
   * y el resultado se anuncia en la región `aria-live`. Escape cancela el arrastre en curso.
   * Las flechas sin Alt no hacen nada aquí: siguen moviendo el scroll.
   */
  onListHandleKeydown(event: KeyboardEvent, list: ChecklistList): void {
    if (event.key === 'Escape') {
      if (!this.draggedListId) return;
      event.preventDefault();
      this.cancelListDrag();
      return;
    }
    const offset = listDragKeyOffset(event);
    if (offset === 0) return;
    event.preventDefault();
    const moved = moveListByOffset(this.board, list.id, offset);
    const order = orderedLists(this.board);
    const index = Math.max(0, order.findIndex((item) => item.id === list.id));
    this.listAnnouncement = moved
      ? listMoveAnnouncement(list.title, index, order.length)
      : listMoveBlockedAnnouncement(list.title, index, order.length);
    if (!moved) return;
    this.scheduleMasonryLayout();
    void this.persist();
  }

  private scheduleMasonryLayout(): void {
    if (this.cardsViewActive) return;
    this.refreshFlowMode();
    if (this.flowMode) {
      // Una columna: flujo normal, sin posiciones absolutas. Es lo que permite que CDK
      // reordene moviendo nodos del DOM.
      this.clearMasonryStyles();
      return;
    }
    this.masonry.scheduleLayout();
  }

  /**
   * Decide si la rejilla va en flujo normal o en masonry, con la histéresis de
   * `resolveBoardFlowMode` (la misma que usan las columnas).
   *
   * Se llama también desde el controlador de masonry antes de cada pasada (`canLayout`),
   * porque su `ResizeObserver` dispara el maquetado sin pasar por aquí: así cualquier
   * cambio de ancho revalúa el modo aunque el observador sea quien avisa.
   *
   * Si el modo cambia con un arrastre táctil en curso, el gesto se cancela: las tarjetas
   * ya no están donde CDK las midió.
   */
  private refreshFlowMode(): void {
    const board = this.boardGridElement;
    if (!board) return;
    const siguiente = resolveBoardFlowMode(this.flowMode, board.clientWidth);
    if (siguiente === this.flowMode) return;
    this.flowMode = siguiente;
    if (this.cdkDragActive) this.cancelCdkDrag();
  }

  /** Normaliza el orden estable guardado tras quitar una lista del tablero. */
  private reorderLists(): void {
    reorderLists(this.board);
  }

  private reorderTasks(list: ChecklistList): void {
    reorderTasks(list);
  }

  private setTaskPositions(list: ChecklistList): void {
    setTaskPositions(list);
  }

  private async persist(): Promise<void> {
    if (this.activeConflict || this.preparePendingRemoteBeforeSave()) return;
    const ownSnapshotToken = this.ownBoardSnapshots.begin(this.board);
    this.busy = true;
    this.saveError = '';
    let saved = false;
    try {
      await this.session.save(this.board);
      saved = true;
      this.scheduleMasonryLayout();
    } catch (error) {
      console.error('No se pudo guardar el tablero sincronizado', error);
      if (!this.activeConflict) {
        this.saveError = 'No se pudieron guardar los cambios en la nube. Revisa tu conexión e inténtalo de nuevo.';
      }
    } finally {
      this.ownBoardSnapshots.complete(ownSnapshotToken, saved);
      this.busy = false;
      this.releasePendingRemoteBoard(saved);
    }
  }
}
