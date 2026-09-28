import { Routes } from '@angular/router';
import { authGuard } from './core/services/auth.guard';

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
  { path: '**', redirectTo: 'board' }
];
