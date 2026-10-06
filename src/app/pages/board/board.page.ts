import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostBinding, HostListener, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonContent, IonHeader, IonIcon, IonInput, IonRefresher, IonRefresherContent,
  IonRippleEffect, IonTitle, IonToolbar
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  add, archiveOutline, checkmark, chevronDown, chevronForward, close, logOut,
  megaphoneOutline, trash, trashBinOutline, personCircle, personRemoveOutline, layersOutline, search, pencil,
  checkmarkCircle, returnDownBack, reorderThree
} from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { ChecklistBoard, ChecklistList, ChecklistTask } from '../../models/board.models';
import { AppFooterComponent } from '../../shared/app-footer/app-footer.component';
import { FeedbackModalComponent } from '../../shared/feedback-modal/feedback-modal.component';
import { BoardConflict } from '../../core/services/board.repository';
import { BoardMergeConflictError, mergeBoardAdditions } from '../../core/board-merge';
import { BoardTheme, BOARD_THEMES, migrateLegacyTheme, storeTheme } from '../../core/board-themes';
import { APP_VERSION_LABEL } from '../../core/app-version';
import { FEEDBACK_FAB_ENABLED } from '../../core/feedback-core';
import { archiveList, isListComplete, MAX_BOARD_LISTS, purgeExpiredArchivedLists, purgeExpiredLists } from '../../core/list-retention';
import { ARCHIVE_RETENTION_DAYS } from '../../core/archive';
import { TRASH_RETENTION_DAYS } from '../../core/trash';
import { AuthService } from '../../core/services/auth.service';
import { DELETE_CONFIRM_TEXT, isDeleteConfirmText } from '../../core/delete-account';
import { BoardOrderService } from '../../core/services/board-order.service';
import { BoardSessionService } from '../../core/services/board-session.service';
import { FeedbackService } from '../../core/services/feedback.service';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [
    CommonModule, FormsModule, IonContent, IonHeader, IonIcon, IonInput, IonRefresher,
    IonRefresherContent, IonRippleEffect, IonTitle, IonToolbar, AppFooterComponent,
    FeedbackModalComponent
  ],
  templateUrl: './board.page.html',
  styleUrls: ['./board.page.scss']
})
export class BoardPage implements OnInit, OnDestroy, AfterViewInit {
  private readonly session = inject(BoardSessionService);
  private readonly auth = inject(AuthService);
  private readonly boardOrder = inject(BoardOrderService);
  private readonly router = inject(Router);
  private readonly feedback = inject(FeedbackService);
  /** Repintado manual: el listener del viewport visual vive fuera del ciclo de Angular. */
  private readonly cdr = inject(ChangeDetectorRef);
  private subscription?: Subscription;
  private lastAppliedBoard: ChecklistBoard | null = null;
  private pendingRemoteBoard: ChecklistBoard | null = null;
  activeConflict: BoardConflict | null = null;
  conflictDialogOpen = false;
  confirmingLocalConflict = false;
  private conflictFromRepository = false;
  private resolvingConflict = false;

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
  readonly showSearchShortcut = detectMacOsBrowser();
  /**
   * El color es de este dispositivo: se lee del almacenamiento local al construir la
   * pantalla, antes del primer pintado, así no sale el color equivocado un instante.
   * Solo local: ninguna otra pestaña, dispositivo ni recarga vuelve a cambiarlo.
   */
  activeTheme: BoardTheme = migrateLegacyTheme(this.auth.session?.user.id ?? null);
  accountMenuOpen = false;
  /** Google Play no admite enlaces externos de donación dentro del APK, así que el
   *  botón de Ko-fi solo se renderiza en la web. */
  readonly isNative = Capacitor.isNativePlatform();
  /** El envío de comentarios necesita sesión: sin ella la función responde 401. */
  get feedbackEnabled(): boolean {
    return this.feedback.available;
  }
  readonly donationMessage = '!Me gusta la app!';
  readonly donationUrl = 'https://ko-fi.com/M4M62R6XT';

  get listProgress(): string {
    return `${Math.min(this.board.lists.length, MAX_BOARD_LISTS) / MAX_BOARD_LISTS * 100}%`;
  }

  get isAtListLimit(): boolean {
    return this.board.lists.length >= MAX_BOARD_LISTS;
  }

  /** Límite de listas del tablero, leído de la constante compartida. */
  readonly maxBoardLists = MAX_BOARD_LISTS;

  /** Texto del botón de añadir lista: avisa cuando el tablero ya está lleno. */
  get listLimitLabel(): string {
    return this.isAtListLimit ? `Límite de ${MAX_BOARD_LISTS} listas alcanzado` : 'Añadir lista';
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
  /** Lista a la que se le va a abrir el diálogo: se archiva si está completa, si no, al basurero. */
  listToRemove: ChecklistList | null = null;
  /** Se enciende mientras el diálogo de archivar ejecuta una de sus acciones: deja los tres
   *  botones deshabilitados para que un doble clic no dispare dos acciones sobre la misma
   *  lista. El diálogo del basurero no lo usa y sigue con su comportamiento de siempre. */
  removeDialogBusy = false;
  /** Botón del tablero que abrió el diálogo de archivar, para devolverle el foco al cerrar. */
  private removeDialogOpener: HTMLElement | null = null;

  private draggedTask: { listId: string; taskId: string } | null = null;

  /** Modal de comentarios abierto. Ambos puntos de entrada (FAB y menú de perfil) lo abren. */
  feedbackOpen = false;
  /** Botón que abrió el modal, para devolverle el foco al cerrar. */
  private feedbackOpener: HTMLElement | null = null;

  /**
   * El botón flotante de comentarios. La constante vive en feedback-core.ts (un solo sitio):
   * ponerla a false quita el botón y nada más, sin tocar el resto de la página.
   */
  readonly feedbackFabEnabled = FEEDBACK_FAB_ENABLED;

  /**
   * El botón flotante de comentarios se esconde mientras haya otro overlay abierto o el
   * teclado en pantalla, para no quedar debajo del panel de nueva lista ni tapar el footer.
   * Es `false` solo cuando hay algo que lo taparía de verdad.
   */
  get feedbackFabVisible(): boolean {
    if (!this.feedbackFabEnabled || this.feedbackOpen) return false;
    if (this.addingList || this.listToRemove || this.conflictDialogOpen) return false;
    if (this.activeConflict || this.accountMenuOpen || this.deleteDialogOpen) return false;
    return !this.isKeyboardOpen;
  }

  /** El teclado está abierto si el viewport visual es bastante más bajo que la ventana. */
  get isKeyboardOpen(): boolean {
    const vv = window.visualViewport;
    if (!vv) return false;
    // Un margen generoso: en Android web el teclado roba más o menos la mitad inferior, y la
    // medida puede no haber ocurrido aún justo en el primer focus.
    return window.innerHeight - vv.height > 120;
  }

  /** Último estado del teclado conocido, para repintar solo cuando cambia de verdad. */
  private keyboardWasOpen = false;

  @ViewChildren('boardItem', { read: ElementRef })
  private boardItems!: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('searchInput', { read: IonInput })
  private searchInput?: IonInput;
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
  @ViewChild('boardGrid', { read: ElementRef, static: false })
  private boardGrid?: ElementRef<HTMLElement>;
  private resizeObserver?: ResizeObserver;
  private layoutFrame: number | null = null;

  private readonly GAP = 22;
  private readonly COMPLETED_PREVIEW_LIMIT = 2;

  constructor() {
    addIcons({search,close,personCircle,personRemoveOutline,checkmark,logOut,pencil,trash,trashBinOutline,reorderThree,add,layersOutline,returnDownBack,checkmarkCircle,chevronDown,chevronForward,archiveOutline,megaphoneOutline});
  }

  ngOnInit(): void {
    void this.initializeBoard();
    // Un único listener de resize del viewport visual, registrado una vez y quitado al
    // destruir la página. `keyboardVisible` no existe: el getter `isKeyboardOpen` lo calcula
    // cada vez; este listener solo fuerza un repintado cuando el teclado se abre o se cierra,
    // para que el botón flotante de comentarios se esconda y vuelva.
    window.visualViewport?.addEventListener('resize', this.onViewportResize);
    window.addEventListener('scroll', this.onViewportResize, { passive: true });
  }

  private readonly onViewportResize = (): void => {
    // Detección de cambio: solo se repinta si el estado del teclado ha cambiado de verdad.
    if (this.keyboardWasOpen === this.isKeyboardOpen) return;
    this.keyboardWasOpen = this.isKeyboardOpen;
    this.cdr.markForCheck();
  };

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
    // El orden aleatorio solo se baraja al llegar el primer tablero con listas; a partir
    // de ahí únicamente se retiran las listas que ya no están y se añaden las nuevas al final.
    this.syncSessionOrder();
    // Los datos suelen llegar después de ngAfterViewInit (carga en la nube), así que
    // hay que observar y maquetar en cuanto se pinta la rejilla.
    this.observeBoardGrid();
    this.scheduleMasonryLayout();
    this.lastAppliedBoard = structuredClone(this.board);
    // Sin este guardado, una lista vencida o el pin inicial volverían a aparecer en el próximo inicio.
    if (persistNormalization && (purged || purgedArchive || pinnedChanged)) void this.persist();
  }

  /**
   * Pasa las listas del tablero al servicio de orden. Se llama en cada punto donde se
   * publica un tablero nuevo para que las altas y las bajas se reflejen sin esperar al
   * próximo guardado (el orden no se guarda: ni se toca `position` ni se escribe nada).
   */
  private syncSessionOrder(): void {
    if (this.boardOrder.sync(this.board.lists, this.board.pinnedListId)) this.scheduleMasonryLayout();
  }

  private receiveBoard(board: ChecklistBoard): void {
    if (this.hasActiveInteraction() || this.activeConflict) {
      this.pendingRemoteBoard = structuredClone(board);
      return;
    }
    this.applyBoard(structuredClone(board));
  }

  private receiveConflict(conflict: BoardConflict | null): void {
    if (conflict) {
      this.activeConflict = conflict;
      this.pendingRemoteBoard = structuredClone(conflict.remoteBoard);
      this.conflictDialogOpen = true;
      this.confirmingLocalConflict = false;
      this.conflictFromRepository = true;
      this.saveError = '';
      return;
    }

    if (!this.resolvingConflict && this.conflictFromRepository) {
      this.activeConflict = null;
      this.conflictFromRepository = false;
      this.conflictDialogOpen = false;
      this.confirmingLocalConflict = false;
      this.releasePendingRemoteBoard();
    }
  }

  private hasActiveInteraction(): boolean {
    return this.busy
      || this.editingTitle
      || this.editingListId !== null
      || this.editingTaskId !== null
      || this.addingList
      || Object.values(this.taskDrafts).some((draft) => Boolean(draft?.trim()))
      || this.draggedTask !== null;
  }

  private releasePendingRemoteBoard(saveSucceeded = false): boolean {
    if (!this.pendingRemoteBoard || this.hasActiveInteraction() || this.activeConflict) return false;

    const remoteBoard = this.pendingRemoteBoard;
    this.pendingRemoteBoard = null;
    if (!saveSucceeded && this.lastAppliedBoard && !this.boardsEqual(this.board, this.lastAppliedBoard)) {
      this.activeConflict = {
        localBoard: structuredClone(this.board),
        remoteBoard: structuredClone(remoteBoard),
        remoteUpdatedAt: '',
        reason: 'Llegaron cambios desde otro dispositivo mientras editabas. Elige qué versión conservar.'
      };
      this.conflictFromRepository = false;
      this.conflictDialogOpen = true;
      this.confirmingLocalConflict = false;
      this.saveError = '';
      return false;
    }

    this.applyBoard(structuredClone(remoteBoard));
    return true;
  }

  private boardsEqual(left: ChecklistBoard, right: ChecklistBoard): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private preparePendingRemoteBeforeSave(): boolean {
    if (!this.pendingRemoteBoard || this.hasActiveInteraction() || this.activeConflict) return false;

    const remoteBoard = this.pendingRemoteBoard;
    this.pendingRemoteBoard = null;
    if (this.lastAppliedBoard && this.boardsEqual(this.board, this.lastAppliedBoard)) {
      this.applyBoard(structuredClone(remoteBoard));
      return true;
    }

    try {
      const mergedBoard = mergeBoardAdditions(this.lastAppliedBoard ?? this.board, this.board, remoteBoard);
      this.applyBoard(mergedBoard, false);
      return false;
    } catch (error) {
      this.activeConflict = {
        localBoard: structuredClone(this.board),
        remoteBoard: structuredClone(remoteBoard),
        remoteUpdatedAt: '',
        reason: error instanceof Error
          ? `No se pueden combinar estos cambios: ${error.message}`
          : 'Llegaron cambios desde otro dispositivo mientras editabas. Elige qué versión conservar.'
      };
      this.conflictFromRepository = false;
      this.conflictDialogOpen = true;
      this.confirmingLocalConflict = false;
      this.saveError = '';
      return true;
    }
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

  closeConflictDialog(): void {
    this.conflictDialogOpen = false;
    this.confirmingLocalConflict = false;
  }

  openConflictDialog(): void {
    if (!this.activeConflict) return;
    this.conflictDialogOpen = true;
    this.confirmingLocalConflict = false;
  }

  async resolveActiveConflict(resolution: 'remote' | 'local'): Promise<void> {
    const conflict = this.activeConflict;
    if (!conflict) return;
    if (resolution === 'local' && !this.confirmingLocalConflict) {
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
        const remoteBoard = this.pendingRemoteBoard ?? conflict.remoteBoard;
        this.pendingRemoteBoard = null;
        this.activeConflict = null;
        this.conflictFromRepository = false;
        this.conflictDialogOpen = false;
        this.confirmingLocalConflict = false;
        this.applyBoard(structuredClone(remoteBoard));
      } else {
        this.board = structuredClone(conflict.localBoard);
        this.lastAppliedBoard = structuredClone(this.board);
        this.syncSessionOrder();
        this.pendingRemoteBoard = null;
        this.activeConflict = null;
        this.conflictFromRepository = false;
        this.conflictDialogOpen = false;
        this.confirmingLocalConflict = false;
        this.scheduleMasonryLayout();
      }
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
    this.accountMenuOpen = !this.accountMenuOpen;
  }

  closeAccountMenu(): void {
    this.accountMenuOpen = false;
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
    this.accountMenuOpen = false;
    await this.router.navigateByUrl('/trash');
  }

  /** Abre la pantalla de archivo de listas desde el botón del header. */
  async openArchive(): Promise<void> {
    this.accountMenuOpen = false;
    await this.router.navigateByUrl('/archive');
  }

  async logout(): Promise<void> {
    this.accountMenuOpen = false;
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
    if (!this.isNative) return;
    this.accountMenuOpen = false;
    this.deleteDialogOpen = true;
    this.deleteConfirmText = '';
    this.deleteBusy = false;
    this.deleteError = '';
    this.deleteUserId = null;
  }

  /** Cierra el diálogo (Escape o Cancelar); con carga en vuelo no hace nada. */
  cancelDeleteDialog(): void {
    if (this.deleteBusy) return;
    this.deleteDialogOpen = false;
    this.deleteConfirmText = '';
    this.deleteError = '';
    this.deleteUserId = null;
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
   * menú de perfil, el panel de nueva lista, los diálogos de eliminar y de conflicto y la
   * búsqueda. Ninguno de ellos depende de estar abierto para funcionar.
   */
  openFeedback(opener?: HTMLElement): void {
    if (!this.feedbackEnabled) return;
    if (this.feedbackOpen) return;

    this.accountMenuOpen = false;
    this.cancelAddList();
    this.cancelDeleteList();
    this.closeConflictDialog();
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

  /** Escape cierra el diálogo de conflicto sin resolverlo y las demás capas abiertas. */
  @HostListener('document:keydown.escape')
  closeOverlaysOnEscape(): void {
    // El modal de comentarios escucha el Escape en su propio overlay; si está abierto, es el
    // que decide (puede pedir confirmación de descarte). Aquí solo se cierran las demás capas.
    if (this.feedbackOpen) return;
    if (this.deleteDialogOpen) {
      this.cancelDeleteDialog();
      return;
    }
    if (this.conflictDialogOpen) {
      this.closeConflictDialog();
      return;
    }
    this.accountMenuOpen = false;
    this.cancelAddList();
    this.cancelDeleteList();
  }

  /** Aplica el tema a las variables CSS del tablero. */
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
    // Los listeners del viewport visual se quitan aquí: abrir y cerrar el modal, o navegar
    // entre pantallas, nunca deja ninguno colgado.
    window.visualViewport?.removeEventListener('resize', this.onViewportResize);
    window.removeEventListener('scroll', this.onViewportResize);
    this.feedbackOpen = false;
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
    this.releasePendingRemoteBoard();
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
    this.releasePendingRemoteBoard();
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
    this.releasePendingRemoteBoard();
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

  /**
   * Atajo ⌘K (solo macOS web): lleva el foco al buscador y selecciona lo que haya para
   * poder escribir encima. Escape no se toca: sigue cerrando overlays y la búsqueda.
   */
  @HostListener('document:keydown', ['$event'])
  onSearchShortcut(event: KeyboardEvent): void {
    if (!this.showSearchShortcut) return;
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

  /**
   * Listas en el orden en que se dibujan: la pinneada primero y el resto en el orden
   * aleatorio de esta sesión (`position` solo es el orden estable guardado, no se usa
   * para mostrar). La búsqueda filtra sobre ese mismo orden, así que no lo altera.
   */
  get visibleLists(): ChecklistList[] {
    const listsById = new Map(this.board.lists.map((list) => [list.id, list]));
    const ordered = this.boardOrder
      .displayOrder(this.board.lists, this.board.pinnedListId)
      .map((id) => listsById.get(id))
      .filter((list): list is ChecklistList => Boolean(list));
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
    // La nueva sube al primer lugar y la anterior conserva su hueco en el orden de sesión.
    this.syncSessionOrder();
    await this.persist();
  }

  /**
   * Deja una sola lista pinneada. Si el pin apunta a una lista que ya no está en el
   * tablero (la acaba de descartar el usuario) o si el tablero aún no tenía ninguna,
   * la primera lista por `position` asume el pin. `position` es el orden estable
   * guardado, así que la elección es la misma en todos los dispositivos y no depende
   * del barajado visual de cada sesión. Devuelve si hubo que corregirlo, para avisar
   * que el tablero debe guardarse.
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

  /** Una lista está terminada cuando tiene tareas y todas están marcadas. */
  isListComplete(list: ChecklistList): boolean {
    return isListComplete(list);
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
    // La lista desaparece del orden de sesión; si vuelve desde el basurero, entra al final.
    this.syncSessionOrder();
    await this.persist();
  }

  /**
   * Archiva una lista 100% completa: sale del tablero y queda guardada 60 días en la
   * pantalla de Archivo, desde donde se puede restaurar o eliminar para siempre.
   * Mismo recorrido que el basurero (pin y orden de sesión se reajustan igual).
   */
  async moveListToArchive(list: ChecklistList): Promise<void> {
    if (!archiveList(this.board, list)) return;
    this.collapsed.delete(list.id);
    this.expandedCompleted.delete(list.id);
    this.reorderLists();
    // Si se archivó la lista pinneada, el pin pasa a la siguiente del tablero.
    this.syncPinnedList();
    // La lista sale del orden de sesión; si se restaura, entra al final.
    this.syncSessionOrder();
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
    if (this.conflictDialogOpen) return;
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
    await this.runRemoveDialogAction((list) => this.moveListToArchive(list));
  }

  /**
   * "Eliminar" del diálogo de una lista completa: mueve la lista al BASURERO con la misma
   * `moveListToTrash` que usa el botón de la cabecera, no la duplica. No es un borrado
   * definitivo: la lista se puede restaurar durante `TRASH_RETENTION_DAYS` días.
   */
  async trashListFromDialog(): Promise<void> {
    await this.runRemoveDialogAction((list) => this.moveListToTrash(list));
  }

  /**
   * Ejecuta una acción del diálogo de archivar. `removeDialogBusy` deja los tres botones
   * deshabilitados mientras dura, así que por apertura del diálogo solo sale una acción:
   * un doble clic en "Archivar lista" o en "Eliminar" no mueve la lista dos veces.
   */
  private async runRemoveDialogAction(run: (list: ChecklistList) => Promise<void>): Promise<void> {
    const list = this.listToRemove;
    if (!list || this.removeDialogBusy) return;
    this.removeDialogBusy = true;
    this.closeRemoveDialog();
    try {
      await run(list);
    } finally {
      this.removeDialogBusy = false;
    }
  }

  /** Cierra el diálogo de archivar y devuelve el foco al botón de la lista que lo abrió. */
  private closeRemoveDialog(): void {
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
   * `position` se sigue usando como orden estable guardado; el orden de la rejilla lo
   * decide el orden de sesión, así que una lista nueva aparece siempre al final salvo
   * que quede pinneada.
   */
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
    this.syncSessionOrder();
    await this.persist();
  }

  cancelAddList(): void {
    this.addingList = false;
    this.newListTitle = '';
    this.releasePendingRemoteBoard();
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
    this.releasePendingRemoteBoard();
  }

  private scheduleMasonryLayout(): void {
    if (this.layoutFrame !== null) cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = null;
      this.applyMasonryLayout();
    });
  }

  /**
   * Recoloca las tarjetas en columnas sin perder el scroll.
   *
   * Las tarjetas son position:absolute, así que el contenedor no crece con ellas: si
   * se dejara en height:auto para medir, el tablero colapsaría a su min-height, el
   * contenedor de scroll perdería toda la altura disponible y el navegador recortaría
   * el scrollTop a 0. Al restituir la altura, la posición ya se había perdido y la
   * vista saltaba al principio. Por eso aquí la altura actual se conserva durante
   * toda la medición y el ancho se fija en las tarjetas para leer su offsetHeight.
   */
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
    // La altura vigente se mantiene mientras se mide; min-height la protege aunque el
    // alto explícito esté a punto de recalcularse. Se anula al final para no arrastrar
    // el valor viejo cuando el tablero crece o se encoge.
    const previousHeight = board.getBoundingClientRect().height;
    board.style.minHeight = `${previousHeight}px`;

    // El ancho basta para medir: la tarjeta conserva su posición anterior hasta que
    // se le asigna la definitiva, y así nunca se apilan en top:0.
    items.forEach((item) => {
      item.style.position = 'absolute';
      item.style.width = `${itemWidth}px`;
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

    board.style.minHeight = '';
    // heights[column] ya incluye un GAP de separación detrás de la última tarjeta de cada
    // columna, así que la altura real del tablero es esa suma menos ese hueco final. Sin
    // restarlo, el pie queda ese GAP más abajo que el resto del diseño.
    const occupied = Math.max(...heights, 0);
    board.style.height = `${items.length > 0 ? Math.max(occupied - this.GAP, 0) : 0}px`;
  }

  /** Normaliza el orden estable guardado tras quitar una lista del tablero. */
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
    if (this.activeConflict || this.preparePendingRemoteBeforeSave()) return;
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
      this.busy = false;
      this.releasePendingRemoteBoard(saved);
    }
  }
}

/**
 * Detecta el navegador de macOS. `userAgentData` es la API moderna y da la plataforma
 * real ("macOS"); `navigator.platform` es la respaldo para navegadores antiguos. En la
 * app nativa no se registra ningún atajo de teclado, así que devuelve false.
 */
function detectMacOsBrowser(): boolean {
  if (typeof navigator === 'undefined' || Capacitor.isNativePlatform()) return false;
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
  return /mac/i.test(platform ?? navigator.platform ?? '');
}

