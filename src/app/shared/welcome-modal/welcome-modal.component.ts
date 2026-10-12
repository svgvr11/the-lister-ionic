import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, ViewChild, output } from '@angular/core';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  archiveOutline,
  checkmark,
  chevronBack,
  chevronForward,
  cloudDoneOutline,
  cloudOutline,
  colorPaletteOutline,
  contractOutline,
  expandOutline,
  gridOutline,
  checkmarkDoneOutline,
  lockClosedOutline,
  chatbubbleEllipsesOutline,
  pulseOutline,
  shieldCheckmarkOutline,
  shieldOutline,
  sparklesOutline,
  trashOutline,
  trendingUpOutline,
  pinOutline,
  searchOutline
} from 'ionicons/icons';
import { ARCHIVE_RETENTION_DAYS } from '../../core/archive';
import { TRASH_RETENTION_DAYS } from '../../core/trash';
import { BOARD_THEMES } from '../../core/board-themes';
import {
  WELCOME_TOUR_PAGE_COUNT,
  isMacOsBrowser,
  isWelcomeFirstPage,
  isWelcomeLastPage,
  nextWelcomePage,
  previousWelcomePage,
  unifiedSearchCardText,
  welcomePageAnnouncement,
  welcomePageCounter,
  welcomePrimaryLabel
} from '../../core/welcome-tour';

/** Tarjeta de contenido de una página. */
interface WelcomeCard {
  icon: string;
  title: string;
  text: string;
  /** Etiqueta corta sobre el título («Recuperable», «Histórico»). */
  badge?: string;
}

/** Contenido de una página del recorrido. */
interface WelcomePageContent {
  chip: string;
  chipIcon: string;
  title: string;
  subtitle: string;
  description: string;
  cards: WelcomeCard[];
}

/**
 * MODAL DE BIENVENIDA (4 páginas, solo escritorio).
 *
 * Se abre una vez por dispositivo y usuario desde el tablero, y a demanda desde el
 * menú de perfil. No muestra ni cambia ningún dato del tablero: solo avisa al tablero
 * de que se cerró (por donde se cierre) para que marque la bandera y devuelva el foco
 * al elemento que lo abrió.
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

  readonly pageCount = WELCOME_TOUR_PAGE_COUNT;
  currentPage = 0;

  /** Plazos leídos de las constantes compartidas: nunca escritos a mano. */
  readonly trashRetentionDays = TRASH_RETENTION_DAYS;
  readonly archiveRetentionDays = ARCHIVE_RETENTION_DAYS;
  /** Tonos del selector de color, contados desde la lista de temas. */
  readonly themeCount = BOARD_THEMES.length;
  /** El atajo ⌘K solo existe en el navegador de un Mac. */
  readonly showSearchShortcut = isMacOsBrowser();

  readonly pages: WelcomePageContent[] = [
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
      description: '',
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

  /** Página visible. */
  get page(): WelcomePageContent {
    return this.pages[this.currentPage];
  }

  get isFirstPage(): boolean {
    return isWelcomeFirstPage(this.currentPage);
  }

  get isLastPage(): boolean {
    return isWelcomeLastPage(this.currentPage, this.pageCount);
  }

  get primaryLabel(): string {
    return welcomePrimaryLabel(this.currentPage, this.pageCount);
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

  constructor() {
    addIcons({
      archiveOutline,
      checkmark,
      chevronBack,
      chevronForward,
      chatbubbleEllipsesOutline,
      cloudDoneOutline,
      cloudOutline,
      colorPaletteOutline,
      contractOutline,
      expandOutline,
      gridOutline,
      lockClosedOutline,
      pinOutline,
      pulseOutline,
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

  /** «Saltar»: cierra desde cualquier página. */
  skip(): void {
    this.closed.emit();
  }

  /** Clic en el fondo: cierra igual que «Saltar» (no hay nada que perder). */
  onBackdropClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) return;
    this.closed.emit();
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
