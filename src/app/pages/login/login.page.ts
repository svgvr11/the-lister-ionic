import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline, listOutline } from 'ionicons/icons';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, IonButton, IonContent, IonIcon, IonSpinner],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss']
})
export class LoginPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  busy = false;
  errorMessage = '';

  constructor() {
    addIcons({ checkmarkCircleOutline, listOutline });
  }

  async ngOnInit(): Promise<void> {
    if (!this.auth.enabled) {
      await this.router.navigateByUrl('/board', { replaceUrl: true });
      return;
    }
    if (await this.auth.getSession()) {
      await this.router.navigateByUrl('/board', { replaceUrl: true });
    }
  }

  async signInWithGoogle(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.errorMessage = '';
    try {
      await this.auth.signInWithGoogle();
    } catch (error) {
      this.errorMessage = error instanceof Error
        ? error.message
        : 'No se pudo iniciar sesión con Google. Inténtalo de nuevo.';
      this.busy = false;
    }
  }
}