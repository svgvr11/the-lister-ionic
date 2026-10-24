import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'board' },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage)
  },
  {
    path: 'board',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/board/board.page').then((m) => m.BoardPage)
  },
  {
    path: 'trash',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/trash/trash.page').then((m) => m.TrashPage)
  },
  {
    path: 'archive',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/archive/archive.page').then((m) => m.ArchivePage)
  },
  /* Páginas legales provisionales: públicas, se abren con y sin sesión. */
  {
    path: 'privacy',
    loadComponent: () => import('./pages/privacy/privacy.page').then((m) => m.PrivacyPage)
  },
  {
    path: 'terms',
    loadComponent: () => import('./pages/terms/terms.page').then((m) => m.TermsPage)
  },
  { path: '**', redirectTo: 'board' }
];
