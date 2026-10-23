import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, ViewChild, input, output } from '@angular/core';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  archiveOutline,
  checkmark,
  checkmarkDoneOutline,
  chevronBack,
  chevronForward,
  chatbubbleEllipsesOutline,
  close,
  cloudDoneOutline,
  cloudOutline,
  colorPaletteOutline,
  contractOutline,
  expandOutline,
  gridOutline,
  handLeftOutline,
  lockClosedOutline,
  pinOutline,
  pulseOutline,
  rocketOutline,
  searchOutline,
  shieldCheckmarkOutline,
  shieldOutline,
  sparklesOutline,
  trashOutline,
  trendingUpOutline
} from 'ionicons/icons';
import { ARCHIVE_RETENTION_DAYS } from '../../../core/archive';
import { TRASH_RETENTION_DAYS } from '../../../core/trash';
import { BOARD_THEMES } from '../../../core/board-themes';
import { APP_VERSION_LABEL } from '../../../core/app-version';
import {
  type WelcomeVariant,
  isMacOsBrowser,
  isWelcomeFirstPage,
  isWelcomeLastPage,
  nextWelcomePage,
  previousWelcomePage,
  unifiedSearchCardText,
  welcomePageAnnouncement,
  welcomePageCounter,
  welcomePageCount,
  welcomePrimaryLabel
} from '../../../core/welcome-tour';

/** Tarjeta de contenido de una página. */
interface WelcomeCard {
  icon: string;
  title: string;
  text: string;
  /** Etiqueta corta sobre el título («Recuperable», «Histórico»). */
  badge?: string;
}

/** Tarjeta única y centrada del cierre del recorrido móvil. */
interface WelcomeHero {
  icon: string;
  title: string;
  text: string;
}

/** Contenido de una página del recorrido. */
interface WelcomePageContent {
  /** Chip de sección: solo en la variante de escritorio. */
  chip?: string;
  chipIcon?: string;
  title: string;
  subtitle: string;
  /** Párrafo de encuadre: solo en la variante de escritorio. */
  description?: string;
  cards: WelcomeCard[];
  /** Tarjeta central de la última página: solo en la variante móvil. */
  hero?: WelcomeHero;
}

/** Umbral en px para que un swipe cuente como cambio de página. */
const SWIPE_THRESHOLD_PX = 50;

/**
 * MODAL DE BIENVENIDA.
 *
 * El mismo recorrido en dos variantes del mismo componente: escritorio (web ancha,
 * 4 páginas, con logo, chip y párrafo) y móvil (app nativa o pantalla estrecha, 3 slides,
 * con X en lugar de «Saltar» y deslizamiento horizontal). La variante la decide el
 * tablero al abrir (`input variant`) y no cambia mientras el modal está abierto.
 *
 * Se abre una vez por dispositivo y usuario desde el tablero, y a demanda desde el menú
 * de perfil. No muestra ni cambia ningún dato del tablero: solo avisa al tablero de que
 * se cerró (por donde se cierre) para que marque la bandera y devuelva el foco al
 * elemento que lo abrió.
 *
 * El estilo (fondo a media opacidad, tarjeta centrada, radio, sombra y animación) y
 * el comportamiento de accesibilidad (rol, foco atrapado, foco inicial en el botón
 * principal) son los del modal de comentarios y del diálogo de ayuda del archivo.
 * Los colores salen SIEMPRE de `--accent` / `--on-accent` del tema activo.
 */
@Component({
  selector: 'app-welcome-modal',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect],
  templateUrl: './welcome-modal.component.html',
  styleUrls: ['./welcome-modal.component.scss']
})
export class WelcomeModalComponent implements AfterViewInit {
  /** El tablero desmonta el modal y marca la bandera de «visto». */
  readonly closed = output<void>();

  /**
   * Variante que abre el tablero: la app nativa y las pantallas de 700px o menos usan
   * la móvil. Se decide al abrir, así que un redimensionado no cambia el modal a mitad.
   */
  readonly variant = input<WelcomeVariant>('desktop');

  currentPage = 0;

  /** Plazos leídos de las constantes compartidas: nunca escritos a mano. */
  readonly trashRetentionDays = TRASH_RETENTION_DAYS;
  readonly archiveRetentionDays = ARCHIVE_RETENTION_DAYS;
  /** Tonos del selector de color, contados desde la lista de temas. */
  readonly themeCount = BOARD_THEMES.length;
  /** El atajo ⌘K solo existe en el navegador de un Mac. */
  readonly showSearchShortcut = isMacOsBrowser();
  /** Año del pie, igual que el pie real del tablero. */
  readonly legalYear = new Date().getFullYear();
  /** Versión de la app, leída del único archivo donde está definida. */
  readonly versionLabel = APP_VERSION_LABEL;

  /** Páginas de la variante de escritorio (4). */
  private readonly desktopPages: WelcomePageContent[] = [
    {
      chip: 'Primeros pasos',
      chipIcon: 'sparkles-outline',
      title: 'Bienvenido a The Lister',
      subtitle: 'Una app de listas de tareas simple, serena y ordenada.',
      description:
        'Crea las listas que necesites, añade tareas, márcalas como hechas y mira tu progreso de un vistazo. Sin ruidos ni distracciones.',
      cards: [
        {
          icon: 'grid-outline',
          title: 'Tablero visual',
          text: 'Organiza tus listas dentro de un lienzo limpio y panorámico con tarjetas ágiles.'
        },
        {
          icon: 'trending-up-outline',
          title: 'Avance inmediato',
          text: 'Marca tareas y sigue el progreso de cada lista de forma dinámica en tiempo real.'
        },
        {
          icon: 'pin-outline',
          title: 'Fijado prioritario',
          text: 'Fija tu lista más urgente con Pin para mantenerla siempre al principio del tablero.'
        }
      ]
    },
    {
      chip: 'Productividad consciente',
      chipIcon: 'pulse-outline',
      title: 'Control y Enfoque Total',
      subtitle: 'Trabaja a tu propio ritmo',
      description:
        'Herramientas diseñadas para mantenerte enfocado en lo que realmente importa cada día.',
      cards: [
        {
          icon: 'expand-outline',
          title: 'Vista de enfoque',
          text: 'Abre cualquier lista en un modal ampliado para concentrarte únicamente en ella sin dispersión.'
        },
        {
          icon: 'search-outline',
          title: 'Búsqueda unificada',
          text: unifiedSearchCardText(this.showSearchShortcut)
        },
        {
          icon: 'color-palette-outline',
          title: 'Personalización limpia',
          text: `Elige entre ${this.themeCount} tonos suaves para codificar y enmarcar visualmente tus tableros.`
        },
        {
          icon: 'contract-outline',
          title: 'Vista compacta',
          text: 'Colapsa las listas que no necesites en el momento para despejar tu espacio de trabajo.'
        }
      ]
    },
    {
      chip: 'Seguridad y respaldo',
      chipIcon: 'shield-outline',
      title: 'Seguridad y Papelera',
      subtitle: 'Sin perder nada por error',
      description:
        'Tus listas cuentan con capas de resguardo para que organices con total tranquilidad mental.',
      cards: [
        {
          icon: 'trash-outline',
          title: `Basurero de ${this.trashRetentionDays} días`,
          text: 'Las listas eliminadas se conservan con cuenta regresiva visible y se restauran con un solo clic.',
          badge: 'Recuperable'
        },
        {
          icon: 'archive-outline',
          title: `Archivo de ${this.archiveRetentionDays} días`,
          text: 'Guarda tus listas 100% completas organizadas en el archivo histórico sin saturar tu tablero diario.',
          badge: 'Histórico'
        },
        {
          icon: 'shield-checkmark-outline',
          title: 'Confirmación y tranquilidad',
          text: 'Protección activa contra eliminaciones accidentales en todo momento y en cada elemento.'
        }
      ]
    },
    {
      chip: 'Sincronización transparente',
      chipIcon: 'cloud-outline',
      title: 'En la Nube y Privacidad Real',
      subtitle: 'Tus datos seguros, donde vayas',
      description:
        'Tu productividad te acompaña siempre con los más altos estándares de privacidad.',
      cards: [
        {
          icon: 'cloud-done-outline',
          title: 'Sincronización en la nube con Google',
          text: 'Accede sin esfuerzo a todas tus listas desde cualquier dispositivo móvil o de escritorio de forma instantánea.'
        },
        {
          icon: 'lock-closed-outline',
          title: '100% sin anuncios y privacidad garantizada',
          text: 'Tu información nunca se vende ni se utiliza para publicidad. Control total para eliminar tu cuenta y tus datos cuando desees desde la app.'
        },
        {
          icon: 'chatbubble-ellipses-outline',
          title: 'Soporte cercano',
          text: '¿Tienes ideas o sugerencias? Envíanos tus comentarios con capturas directamente desde la app en segundos.'
        }
      ]
    }
  ];

  /**
   * Páginas de la variante móvil (3 slides): mismas ideas con menos texto, sin chip ni
   * párrafo, con la X en lugar de «Saltar» y con una tarjeta central de cierre.
   * Cada afirmación se ha comprobado contra la app real (ver el informe de entrega).
   */
  private readonly mobilePages: WelcomePageContent[] = [
    {
      title: 'Bienvenido a The Lister',
      subtitle: 'Una app de listas de tareas simple, ordenada y sin distracciones.',
      cards: [
        {
          icon: 'grid-outline',
          title: 'Tablero con tarjetas',
          text: 'Organiza tus tareas en listas visuales, fluidas y claras.'
        },
        {
          icon: 'checkmark-done-outline',
          title: 'Progreso de un vistazo',
          text: 'Marca tareas hechas con barra de avance y badge 100%.'
        },
        {
          icon: 'pin-outline',
          title: 'Fija listas clave',
          text: 'Mantén tu lista más prioritaria fija al principio del flujo.'
        }
      ]
    },
    {
      title: 'Control y Organización',
      subtitle: 'Flexibilidad total para gestionar tus listas a tu ritmo.',
      cards: [
        {
          icon: 'contract-outline',
          title: 'Listas plegables',
          text: 'En la vista de lista, colapsa las listas para mantener tu espacio despejado.'
        },
        {
          icon: 'hand-left-outline',
          title: 'Gestiona a un toque',
          text: 'Abre una lista para marcar sus tareas, fijarla, renombrarla o archivarla sin salir del flujo.'
        }
      ]
    },
    {
      title: 'Tu espacio está preparado',
      subtitle: 'Todo listo para organizar tus tareas con claridad y serenidad.',
      cards: [],
      hero: {
        icon: 'rocket-outline',
        title: '¡Todo listo!',
        text: 'Comienza renombrando el tablero y creando tu primera lista.'
      }
    }
  ];

  /** La variante abierta decide cuántas páginas y cuáles se muestran. */
  get isMobile(): boolean {
    return this.variant() === 'mobile';
  }

  get pages(): WelcomePageContent[] {
    return this.isMobile ? this.mobilePages : this.desktopPages;
  }

  /** Página visible. */
  get page(): WelcomePageContent {
    return this.pages[this.currentPage];
  }

  /** Número de páginas de la variante abierta. */
  get pageCount(): number {
    return welcomePageCount(this.variant());
  }

  get isFirstPage(): boolean {
    return isWelcomeFirstPage(this.currentPage);
  }

  get isLastPage(): boolean {
    return isWelcomeLastPage(this.currentPage, this.pageCount);
  }

  get primaryLabel(): string {
    return welcomePrimaryLabel(this.currentPage, this.pageCount, this.variant());
  }

  get counterLabel(): string {
    return welcomePageCounter(this.currentPage, this.pageCount);
  }

  /** Anuncio de la región viva: cambia con la página. */
  get pageAnnouncement(): string {
    return welcomePageAnnouncement(this.currentPage, this.pageCount, this.page.title);
  }

  @ViewChild('dialog', { read: ElementRef }) private dialog?: ElementRef<HTMLElement>;
  @ViewChild('nextButton', { read: ElementRef }) private primary?: ElementRef<HTMLButtonElement>;
  /** Punto de partida del arrastre, para reconocer el swipe sin romper el scroll. */
  private swipeStart: { x: number; y: number } | null = null;

  constructor() {
    addIcons({
      archiveOutline,
      checkmark,
      checkmarkDoneOutline,
      chevronBack,
      chevronForward,
      chatbubbleEllipsesOutline,
      close,
      cloudDoneOutline,
      cloudOutline,
      colorPaletteOutline,
      contractOutline,
      expandOutline,
      gridOutline,
      handLeftOutline,
      lockClosedOutline,
      pinOutline,
      pulseOutline,
      rocketOutline,
      searchOutline,
      shieldCheckmarkOutline,
      shieldOutline,
      sparklesOutline,
      trashOutline,
      trendingUpOutline
    });
  }

  /**
   * El foco entra en el botón principal («Siguiente»), que es además donde se queda al
   * cambiar de página: el pie no se remonta, así que el foco no salta.
   */
  ngAfterViewInit(): void {
    this.primary?.nativeElement.focus();
  }

  /**
   * Botón principal: avanza una página y, en la última, cierra el recorrido
   * («¡Empezar a organizar!»).
   */
  advance(): void {
    if (this.isLastPage) {
      this.closed.emit();
      return;
    }
    this.currentPage = nextWelcomePage(this.currentPage, this.pageCount);
  }

  /** «Anterior»: retrocede una página sin bajar de la primera (donde está deshabilitado). */
  prev(): void {
    if (this.isFirstPage) return;
    this.currentPage = previousWelcomePage(this.currentPage);
  }

  /** «Saltar» y la X: cierran desde cualquier página. */
  skip(): void {
    this.closed.emit();
  }

  /** Clic en el fondo: cierra igual que «Saltar» o la X (no hay nada que perder). */
  onBackdropClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) return;
    this.closed.emit();
  }

  /**
   * Inicio del arrastre horizontal. Se guarda el punto sin frenar nada: el scroll
   * vertical tiene que seguir funcionando.
   */
  onBodyTouchStart(event: TouchEvent): void {
    const touch = event.changedTouches[0];
    this.swipeStart = { x: touch.clientX, y: touch.clientY };
  }

  /**
   * Fin del arrastre: si el dedo se movió más en horizontal que en vertical y pasó el
   * umbral, se cambia de slide. El movimiento corto o vertical se ignora, así que un
   * scroll normal no cambia de página sin querer.
   */
  onBodyTouchEnd(event: TouchEvent): void {
    const start = this.swipeStart;
    this.swipeStart = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0) this.advance();
    else this.prev();
  }

  /**
   * Teclado dentro del diálogo: flechas cambian de página, Enter avanza y Tab queda
   * atrapado. Enter sobre un botón NO se trata aquí: el clic del propio botón ya hace
   * su acción y tratararlo además avanzaría dos páginas de golpe.
   */
  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.prev();
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.advance();
      return;
    }
    if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      this.advance();
      return;
    }
    if (event.key === 'Tab') this.keepFocusInDialog(event);
  }

  /**
   * Foco atrapado: al tabular por los extremos el foco vuelve a entrar por el lado
   * contrario, sin salirse a la página de detrás.
   */
  private keepFocusInDialog(event: KeyboardEvent): void {
    const dialog = this.dialog?.nativeElement;
    if (!dialog) return;
    const controles = Array.from(
      dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')
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
}
