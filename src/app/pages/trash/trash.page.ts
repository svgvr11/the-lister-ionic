import { Component, HostBinding, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBack } from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';
import { DEFAULT_BOARD_THEME, readStoredTheme } from '../../core/board-themes';

/** Pantalla de basurero. Por ahora no muestra contenido: solo el armazón de navegación. */
@Component({
  selector: 'app-trash',
  standalone: true,
  imports: [IonContent, IonHeader, IonIcon, IonToolbar],
  templateUrl: './trash.page.html',
  styleUrls: ['./trash.page.scss']
})
export class TrashPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  @HostBinding('style.--board-bg') boardBackground = DEFAULT_BOARD_THEME.background;

  constructor() {
    addIcons({ chevronBack });
  }

  ngOnInit(): void {
    // Reutiliza el color de tablero elegido en el menú de perfil.
    this.boardBackground = readStoredTheme(this.auth.session?.user.id ?? null).background;
  }

  goBack(): void {
    void this.router.navigateByUrl('/board');
  }
}